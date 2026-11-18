import { useEffect, useRef, useState } from "react";
import { Heart, MessageCircle, Bookmark, Share2, Pencil, Trash2, X, Send } from "lucide-react";
import { Markdown } from "./Markdown";
import { communityRequest, communityImageUrl, communityPostUrl, communityTime, errorText, type CommunityMember, type CommunityPost, type CommunityComment, type CommunityPage } from "../community";

export const communityButton = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";
export const communityPrimary = `${communityButton} border-transparent bg-primary text-primary-foreground hover:bg-primary/90`;
export const communityInput = "w-full rounded-xl border border-border bg-input-background p-3 text-[13px] text-foreground outline-none focus:border-primary disabled:opacity-50";

function Avatar({ member }: { member: CommunityMember }) {
  return <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">{member.nickname.slice(0, 1)}</span>;
}

function DeletePrompt({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div role="group" aria-label="删除确认" className="my-3 flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
    <span className="mr-auto">删除后无法恢复，确定删除？</span>
    <button className={communityButton} disabled={busy} onClick={onCancel}>取消</button>
    <button className={`${communityButton} text-destructive`} disabled={busy} onClick={onConfirm}>{busy ? "正在删除…" : "确认删除"}</button>
  </div>;
}

function Comments({ postId, onChanged }: { postId: string; onChanged: () => void }) {
  const [items, setItems] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(() => { try { return sessionStorage.getItem(`community-comment-${postId}`) ?? ""; } catch { return ""; } });
  const [reply, setReply] = useState<CommunityComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(`community-comment-${postId}`, draft); } catch { /* Draft remains in memory. */ }
  }, [postId, draft]);

  async function load(offset = 0) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true); setError("");
    try {
      const page = await communityRequest<CommunityPage<CommunityComment>>(`/posts/${postId}/comments?offset=${offset}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setItems(previous => offset ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items);
      setHasMore(page.has_more);
    } catch (err) { if (!controller.signal.aborted) setError(errorText(err)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }

  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [postId]);

  async function send() {
    if (!draft.trim() || busy || loading) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const comment = await communityRequest<CommunityComment>(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ markdown: draft.trim(), parent_id: reply?.id ?? null }) });
      // Keep pagination offsets intact: later pages will include this comment.
      if (!hasMore) setItems(previous => [...previous, comment]);
      setDraft(""); setReply(null); onChanged();
      setNotice(hasMore ? "评论已发布，加载后续评论即可查看。" : "评论已发布");
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setError("");
    try {
      await communityRequest(`/comments/${id}`, { method: "DELETE" });
      setItems(previous => previous.map(item => item.id === id ? { ...item, deleted: true, markdown: "", is_owner: false } : item));
      if (reply?.id === id) setReply(null);
      setDeleteId(null); onChanged();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  return <section aria-label="评论区" className="mt-3 space-y-3 border-t border-border pt-4">
    <div className="flex items-center justify-between"><h4 className="text-xs font-medium">讨论与回复</h4><button onClick={() => void load()} disabled={loading || busy} className="text-xs text-muted-foreground hover:text-primary">刷新评论</button></div>
    {error && <p role="alert" className="text-xs text-destructive">{error} <button className="underline" onClick={() => void load()}>重新加载</button></p>}
    {notice && <p role="status" className="text-xs text-primary">{notice}</p>}
    {!loading && !items.length && !error && <p className="py-2 text-xs text-muted-foreground">还没有评论，来分享你的想法吧。</p>}
    {items.map(comment => <div key={comment.id} className={`rounded-xl bg-secondary/40 p-3 ${comment.parent_id ? "ml-4 border-l-2 border-primary/20" : ""}`}>
      <div className="mb-1 flex items-center gap-2 text-[11px]"><span className="font-medium">{comment.author.nickname}</span><time className="text-muted-foreground" dateTime={comment.created_at}>{communityTime(comment.created_at)}</time>
        {comment.is_owner && <button aria-label="删除评论" className="ml-auto text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => setDeleteId(comment.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
      {comment.parent_id && <p className="mb-1 text-[11px] text-primary">回复 {items.find(item => item.id === comment.parent_id)?.author.nickname ?? "前面的评论"}</p>}
      {comment.deleted ? <p className="text-xs text-muted-foreground">该评论已删除</p> : <><div className="break-words"><Markdown>{comment.markdown}</Markdown></div><button className="mt-2 text-[11px] text-primary" onClick={() => { setReply(comment); inputRef.current?.focus(); }}>回复</button></>}
      {deleteId === comment.id && <DeletePrompt busy={busy} onCancel={() => setDeleteId(null)} onConfirm={() => void remove(comment.id)} />}
    </div>)}
    {loading && <p role="status" className="text-xs text-muted-foreground">正在加载评论…</p>}
    {hasMore && <button disabled={loading || busy} className={communityButton} onClick={() => void load(items.length)}>加载更多评论</button>}
    {reply && <div className="flex items-center gap-2 text-xs text-primary">正在回复 {reply.author.nickname}<button aria-label="取消回复" onClick={() => setReply(null)}><X className="h-3.5 w-3.5" /></button></div>}
    <textarea aria-label={reply ? `回复 ${reply.author.nickname}` : "评论内容"} ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void send(); } }} disabled={busy} maxLength={2000} rows={2} placeholder="友善交流，支持 Markdown 与公式…" className={communityInput} />
    <div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{draft.length}/2000 · Ctrl / ⌘ + Enter 发送</span><button className={communityPrimary} disabled={busy || loading || !draft.trim()} onClick={() => void send()}><Send className="h-3.5 w-3.5" />{busy ? "提交中…" : "发表评论"}</button></div>
  </section>;
}

export function CommunityPostCard({ post, onUpdate, onDelete, onTag, onNotice, openComments = false }: {
  post: CommunityPost; onUpdate: (post: CommunityPost) => void; onDelete: () => void;
  onTag: (tag: string) => void; onNotice: (text: string) => void; openComments?: boolean;
}) {
  const [commentsOpen, setCommentsOpen] = useState(openComments);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.markdown);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [image, setImage] = useState<string | null>(null);

  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function updateReaction(kind: "like" | "bookmark") {
    const updated = await communityRequest<CommunityPost>(`/posts/${post.id}/${kind}`, { method: "PUT", body: JSON.stringify({ active: !(kind === "like" ? post.liked : post.bookmarked) }) });
    onUpdate(updated);
  }
  async function share() {
    const url = communityPostUrl(post.id);
    try { await navigator.clipboard.writeText(url); onNotice("帖子链接已复制"); }
    catch { setShareUrl(url); }
  }
  async function refreshPost() {
    try { onUpdate(await communityRequest<CommunityPost>(`/posts/${post.id}`)); } catch (err) { setError(errorText(err)); }
  }

  return <article id={`post-${post.id}`} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex items-center gap-3"><Avatar member={post.author} /><div className="min-w-0 flex-1"><span className="break-words text-[13px] font-medium">{post.author.nickname}{post.is_owner && <span className="ml-2 text-[10px] text-primary">我</span>}</span><time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString("zh-CN")} className="block text-[10px] text-muted-foreground">{communityTime(post.created_at)}{post.updated_at > post.created_at && " · 已编辑"}</time></div>
      {post.is_owner && <><button aria-label="编辑动态" disabled={busy || editing} className="text-muted-foreground hover:text-primary disabled:opacity-50" onClick={() => { setText(post.markdown); setEditing(true); }}><Pencil className="h-4 w-4" /></button><button aria-label="删除动态" disabled={busy} className="text-muted-foreground hover:text-destructive" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" /></button></>}
    </div>
    {post.tags.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5">{post.tags.map(tag => <button key={tag} onClick={() => onTag(tag)} className="rounded-md bg-primary/10 px-2 py-1 text-[11px] text-primary">#{tag}</button>)}</div>}
    {editing ? <div className="space-y-2"><textarea aria-label="编辑动态内容" className={communityInput} rows={5} maxLength={10000} value={text} onChange={event => setText(event.target.value)} disabled={busy} /><div className="flex justify-end gap-2"><button className={communityButton} disabled={busy} onClick={() => setEditing(false)}>取消编辑</button><button className={communityPrimary} disabled={busy || (!text.trim() && !post.images.length)} onClick={() => void action(async () => { onUpdate(await communityRequest<CommunityPost>(`/posts/${post.id}`, { method: "PATCH", body: JSON.stringify({ markdown: text, images: post.images }) })); setEditing(false); onNotice("动态已更新"); })}>保存修改</button></div></div>
      : <div className="break-words [overflow-wrap:anywhere]"><Markdown>{post.markdown.replace(/^(?:\s*#[^\s#]+)+\s*\n+/, "")}</Markdown></div>}
    {post.images.length > 0 && <div className={`mt-3 grid gap-2 ${post.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{post.images.map((src, index) => <button key={src} aria-label={`查看配图 ${index + 1}`} className="overflow-hidden rounded-xl border border-border bg-secondary" onClick={() => setImage(src)}><img src={communityImageUrl(src)} loading="lazy" alt={`动态配图 ${index + 1}`} className="max-h-72 w-full object-cover" /></button>)}</div>}
    {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
    {deleting && <DeletePrompt busy={busy} onCancel={() => setDeleting(false)} onConfirm={() => void action(async () => { await communityRequest(`/posts/${post.id}`, { method: "DELETE" }); onDelete(); onNotice("动态已删除"); })} />}
    <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
      <button aria-label={post.liked ? "取消点赞" : "点赞"} aria-pressed={post.liked} disabled={busy} onClick={() => void action(() => updateReaction("like"))} className={`flex items-center gap-1.5 disabled:opacity-50 ${post.liked ? "text-destructive" : "hover:text-destructive"}`}><Heart className={`h-4 w-4 ${post.liked ? "fill-current" : ""}`} />{post.likes}</button>
      <button aria-label="查看评论" aria-expanded={commentsOpen} onClick={() => setCommentsOpen(!commentsOpen)} className="flex items-center gap-1.5 hover:text-primary"><MessageCircle className="h-4 w-4" />{post.comments}</button>
      <button aria-label={post.bookmarked ? "取消收藏" : "收藏"} aria-pressed={post.bookmarked} disabled={busy} onClick={() => void action(() => updateReaction("bookmark"))} className={`flex items-center gap-1.5 disabled:opacity-50 ${post.bookmarked ? "text-primary" : "hover:text-primary"}`}><Bookmark className={`h-4 w-4 ${post.bookmarked ? "fill-current" : ""}`} />{post.bookmarked ? "已收藏" : "收藏"}</button>
      <button onClick={() => void share()} className="ml-auto flex items-center gap-1.5 hover:text-primary"><Share2 className="h-4 w-4" />分享</button>
    </div>
    {shareUrl && <div className="mt-3 space-y-1"><label htmlFor={`share-${post.id}`} className="text-xs text-muted-foreground">复制此链接分享动态</label><input id={`share-${post.id}`} readOnly value={shareUrl} className={communityInput} onFocus={event => event.target.select()} /></div>}
    {commentsOpen && <Comments postId={post.id} onChanged={() => void refreshPost()} />}
    {image && <ImagePreview src={image} onClose={() => setImage(null)} />}
  </article>;
}

function ImagePreview({ src, onClose }: { src: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={dialogRef} aria-label="图片预览" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className="max-h-[90vh] max-w-[95vw] rounded-2xl border border-border bg-card p-3 text-foreground backdrop:bg-black/70"><button autoFocus aria-label="关闭图片预览" className="mb-2 ml-auto flex rounded-full p-2 hover:bg-secondary" onClick={onClose}><X className="h-5 w-5" /></button><img src={communityImageUrl(src)} alt="动态配图完整预览" className="max-h-[75vh] max-w-full object-contain" /></dialog>;
}
