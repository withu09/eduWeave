"""Shared community content with server-issued, browser-local guest identities."""
import datetime as dt
import hashlib
import io
import json
import re
import secrets
import warnings
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.database import get_db
from app.db.models import CommunityMember, CommunityPost, CommunityImage, CommunityComment, CommunityReaction

def no_cache(response: Response):
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/api/community", tags=["Community"], dependencies=[Depends(no_cache)])
Database = Annotated[Session, Depends(get_db)]
# A separate header preserves the gateway's HTTP Basic Authorization header.
Token = Annotated[str | None, Header(alias="X-Community-Token", max_length=100)]
IMAGE_PREFIX = "/api/community/images/"
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def member_for(db: Session, token: str | None, required: bool = True):
    if not token:
        if required:
            raise HTTPException(401, "请先建立社区身份")
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    member = db.query(CommunityMember).filter_by(token_hash=digest).first()
    if member is None:
        raise HTTPException(401, "社区身份已失效，请保留草稿后重新建立身份")
    return member


def profile(member):
    return {"id": member.id, "nickname": member.nickname}


def iso(value):
    return value.replace(tzinfo=dt.timezone.utc).isoformat()


def post_for(db, post_id, lock=False):
    query = db.query(CommunityPost).filter_by(id=post_id)
    if lock:
        query = query.with_for_update()
    post = query.first()
    if post is None:
        raise HTTPException(404, "动态不存在或已删除")
    return post


def owned(item, member):
    if item.author_id != member.id:
        raise HTTPException(403, "只能修改或删除自己发布的内容")


def serialize_posts(db, posts, member):
    ids = [post.id for post in posts]
    if not ids:
        return []
    totals = {(pid, kind): count for pid, kind, count in db.query(
        CommunityReaction.post_id, CommunityReaction.kind, func.count()
    ).filter(CommunityReaction.post_id.in_(ids)).group_by(CommunityReaction.post_id, CommunityReaction.kind)}
    comments = dict(db.query(CommunityComment.post_id, func.count()).filter(
        CommunityComment.post_id.in_(ids), CommunityComment.deleted.is_(False)
    ).group_by(CommunityComment.post_id))
    mine = set(db.query(CommunityReaction.post_id, CommunityReaction.kind).filter(
        CommunityReaction.post_id.in_(ids), CommunityReaction.member_id == member.id
    ).all()) if member else set()
    return [{
        "id": post.id, "author": profile(post.author), "markdown": post.markdown,
        "tags": json.loads(post.tags), "images": [IMAGE_PREFIX + image.id for image in post.images],
        "created_at": iso(post.created_at), "updated_at": iso(post.updated_at),
        "likes": totals.get((post.id, "like"), 0), "bookmarks": totals.get((post.id, "bookmark"), 0),
        "comments": comments.get(post.id, 0), "liked": (post.id, "like") in mine,
        "bookmarked": (post.id, "bookmark") in mine, "is_owner": bool(member and post.author_id == member.id),
    } for post in posts]


class ProfileRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=24)

    @field_validator("nickname")
    @classmethod
    def trim_name(cls, value):
        value = value.strip()
        if not value or any(ord(char) < 32 for char in value):
            raise ValueError("请输入 1–24 字的昵称")
        return value


class PostRequest(BaseModel):
    markdown: str = Field(default="", max_length=10000)
    images: list[str] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def content(self):
        self.markdown = self.markdown.strip()
        if not self.markdown and not self.images:
            raise ValueError("请填写内容或添加图片")
        if len(set(self.images)) != len(self.images):
            raise ValueError("不能重复添加同一张图片")
        if any(not re.fullmatch(r"/api/community/images/[a-f0-9-]{36}", image) for image in self.images):
            raise ValueError("请使用社区上传的图片")
        return self


class CommentRequest(BaseModel):
    markdown: str = Field(min_length=1, max_length=2000)
    parent_id: str | None = Field(default=None, max_length=36)

    @field_validator("markdown")
    @classmethod
    def trim_text(cls, value):
        if not value.strip():
            raise ValueError("评论不能为空")
        return value.strip()


class ReactionRequest(BaseModel):
    active: bool


def save_content(db, post, req, member):
    images = []
    for position, url in enumerate(req.images):
        image = db.query(CommunityImage).filter_by(id=url.removeprefix(IMAGE_PREFIX)).with_for_update().first()
        if image is None or image.author_id != member.id or image.post_id not in (None, post.id):
            raise HTTPException(422, "图片不可用，请重新上传")
        image.position = position
        images.append(image)
    post.images = images
    post.markdown = req.markdown
    tags = re.findall(r"(?:^|\s)#([^\s#.,，。!！?？:：;；]+)", req.markdown)
    post.tags = json.dumps(list(dict.fromkeys(tag[:32] for tag in tags))[:10], ensure_ascii=False)
    if post.created_at is not None:
        post.updated_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


@router.post("/session")
def session(db: Database, response: Response, x_community_token: Token = None):
    response.headers["Cache-Control"] = "no-store"
    if x_community_token:
        return {"member": profile(member_for(db, x_community_token))}
    token = secrets.token_urlsafe(32)
    member = CommunityMember(token_hash=hashlib.sha256(token.encode()).hexdigest(), nickname="学习者" + secrets.token_hex(3))
    db.add(member)
    db.commit()
    return {"member": profile(member), "token": token}


@router.patch("/me")
def update_profile(req: ProfileRequest, db: Database, x_community_token: Token = None):
    member = member_for(db, x_community_token)
    member.nickname = req.nickname
    db.commit()
    return profile(member)


@router.get("/posts")
def list_posts(
    db: Database, x_community_token: Token = None, q: str = Query(default="", max_length=100),
    tag: str = Query(default="", max_length=32), sort: Literal["time", "hot"] = "time",
    scope: Literal["all", "mine", "bookmarks"] = "all",
    offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=50),
):
    member = member_for(db, x_community_token, required=scope != "all")
    query = db.query(CommunityPost).join(CommunityMember, CommunityPost.author_id == CommunityMember.id)
    if scope == "mine":
        query = query.filter(CommunityPost.author_id == member.id)
    elif scope == "bookmarks":
        query = query.filter(CommunityPost.id.in_(db.query(CommunityReaction.post_id).filter_by(member_id=member.id, kind="bookmark")))
    if q.strip():
        pattern = "%" + q.strip().lstrip("#").replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_") + "%"
        query = query.filter(or_(CommunityPost.markdown.ilike(pattern, escape="\\"), CommunityMember.nickname.ilike(pattern, escape="\\")))
    if tag:
        # Match a complete JSON string, so #树 does not also match #二叉树.
        encoded = json.dumps(tag, ensure_ascii=False).replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        query = query.filter(CommunityPost.tags.like("%" + encoded + "%", escape="\\"))
    total = query.count()
    if sort == "hot":
        score = db.query(func.count()).select_from(CommunityReaction).filter(
            CommunityReaction.post_id == CommunityPost.id, CommunityReaction.kind == "like"
        ).correlate(CommunityPost).scalar_subquery()
        query = query.order_by(score.desc())
    posts = query.order_by(CommunityPost.created_at.desc(), CommunityPost.id.desc()).options(
        joinedload(CommunityPost.author), selectinload(CommunityPost.images)
    ).offset(offset).limit(limit).all()
    return {"items": serialize_posts(db, posts, member), "total": total, "offset": offset, "has_more": offset + len(posts) < total}


@router.get("/tags")
def tags(db: Database):
    # Bound the scan; these are the most-used tags in the latest 1,000 posts.
    counts = {}
    for (raw,) in db.query(CommunityPost.tags).order_by(CommunityPost.created_at.desc()).limit(1000):
        for tag in json.loads(raw):
            counts[tag] = counts.get(tag, 0) + 1
    return {"items": [{"tag": tag, "count": count} for tag, count in sorted(counts.items(), key=lambda row: (-row[1], row[0]))[:12]]}


@router.get("/posts/{post_id}")
def get_post(post_id: str, db: Database, x_community_token: Token = None):
    member = member_for(db, x_community_token, required=False)
    return serialize_posts(db, [post_for(db, post_id)], member)[0]


@router.post("/posts", status_code=201)
def create_post(req: PostRequest, db: Database, x_community_token: Token = None):
    member = member_for(db, x_community_token)
    post = CommunityPost(author_id=member.id, markdown="")
    db.add(post)
    db.flush()
    save_content(db, post, req, member)
    post.updated_at = post.created_at
    db.commit()
    return serialize_posts(db, [post], member)[0]


@router.patch("/posts/{post_id}")
def edit_post(post_id: str, req: PostRequest, db: Database, x_community_token: Token = None):
    member = member_for(db, x_community_token)
    post = post_for(db, post_id, lock=True)
    owned(post, member)
    save_content(db, post, req, member)
    db.commit()
    return serialize_posts(db, [post], member)[0]


@router.delete("/posts/{post_id}", status_code=204)
def delete_post(post_id: str, db: Database, x_community_token: Token = None):
    member = member_for(db, x_community_token)
    post = post_for(db, post_id, lock=True)
    owned(post, member)
    # Remove self-references before cascading so SQLite and PostgreSQL agree.
    db.query(CommunityComment).filter_by(post_id=post.id).update({"parent_id": None}, synchronize_session=False)
    db.delete(post)
    db.commit()


@router.put("/posts/{post_id}/{kind}")
def react(post_id: str, kind: Literal["like", "bookmark"], req: ReactionRequest, db: Database, x_community_token: Token = None):
    member = member_for(db, x_community_token)
    post = post_for(db, post_id, lock=True)
    key = {"post_id": post_id, "member_id": member.id, "kind": kind}
    current = db.get(CommunityReaction, key)
    if req.active and current is None:
        db.add(CommunityReaction(**key))
    elif not req.active and current is not None:
        db.delete(current)
    db.commit()
    return serialize_posts(db, [post], member)[0]


def serialize_comment(comment, member):
    return {"id": comment.id, "post_id": comment.post_id, "author": profile(comment.author),
            "parent_id": comment.parent_id, "markdown": "" if comment.deleted else comment.markdown,
            "deleted": comment.deleted, "created_at": iso(comment.created_at),
            "is_owner": bool(member and comment.author_id == member.id and not comment.deleted)}


@router.get("/posts/{post_id}/comments")
def list_comments(post_id: str, db: Database, x_community_token: Token = None,
                  offset: int = Query(default=0, ge=0), limit: int = Query(default=50, ge=1, le=100)):
    member = member_for(db, x_community_token, required=False)
    post_for(db, post_id)
    query = db.query(CommunityComment).filter_by(post_id=post_id)
    total = query.count()
    comments = query.options(joinedload(CommunityComment.author)).order_by(CommunityComment.created_at, CommunityComment.id).offset(offset).limit(limit).all()
    return {"items": [serialize_comment(comment, member) for comment in comments], "total": total, "has_more": offset + len(comments) < total}


@router.post("/posts/{post_id}/comments", status_code=201)
def create_comment(post_id: str, req: CommentRequest, db: Database, x_community_token: Token = None):
    member = member_for(db, x_community_token)
    post_for(db, post_id, lock=True)
    if req.parent_id:
        parent = db.get(CommunityComment, req.parent_id)
        if parent is None or parent.post_id != post_id or parent.deleted:
            raise HTTPException(422, "回复目标不存在或已删除，请重新选择")
    comment = CommunityComment(post_id=post_id, author_id=member.id, markdown=req.markdown, parent_id=req.parent_id)
    db.add(comment)
    db.commit()
    return serialize_comment(comment, member)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: str, db: Database, x_community_token: Token = None):
    member = member_for(db, x_community_token)
    comment = db.get(CommunityComment, comment_id)
    if comment is None:
        raise HTTPException(404, "评论不存在")
    post_for(db, comment.post_id, lock=True)
    owned(comment, member)
    comment.deleted, comment.markdown = True, ""
    db.commit()


@router.post("/images", status_code=201)
def upload_image(db: Database, file: Annotated[UploadFile, File()], x_community_token: Token = None):
    member = member_for(db, x_community_token)
    try:
        raw = file.file.read(MAX_IMAGE_BYTES + 1)
    finally:
        file.file.close()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "每张图片不能超过 5 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {"PNG", "JPEG", "WEBP"} or image.width * image.height > 16_000_000:
                    raise ValueError("unsupported image")
                image = ImageOps.exif_transpose(image)
                image.thumbnail((1920, 1920))
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                output = io.BytesIO()
                image.save(output, "WEBP", quality=85)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, "请上传有效的 JPG、PNG 或 WebP 图片，像素不超过 1600 万")
    # Discard abandoned uploads after a day. Attached images live with their post.
    db.query(CommunityImage).filter(CommunityImage.post_id.is_(None), CommunityImage.created_at < dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(days=1)).delete(synchronize_session=False)
    image_row = CommunityImage(author_id=member.id, data=output.getvalue())
    db.add(image_row)
    db.commit()
    return {"url": IMAGE_PREFIX + image_row.id}


@router.get("/images/{image_id}")
def get_image(image_id: str, db: Database):
    image = db.get(CommunityImage, image_id)
    if image is None:
        raise HTTPException(404, "图片不存在或已删除")
    return Response(image.data, media_type="image/webp", headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600"})
