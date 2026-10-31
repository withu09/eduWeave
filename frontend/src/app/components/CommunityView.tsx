import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Users, ImagePlus, Eye, Pencil, Heart, MessageCircle, Share2, X, Sigma, Search, Hash, Flame, Clock } from "lucide-react";
import { communityPosts, parseTags, type CommunityPost } from "../data";
import { Markdown } from "./Markdown";
import { ImageWithFallback } from "./figma/ImageWithFallback";

const STORAGE_KEY = "eduweave_community_posts_v2";
const LIKED_KEY = "eduweave_community_liked";

type SortMode = "time" | "hot";

const SAMPLE = `#公式分享

行内公式 $E = mc^2$,块级公式:

$$\\int_0^1 x^2 \\,dx = \\frac{1}{3}$$

支持 **加粗**、\`代码\` 和列表~`;

function loadPosts(): CommunityPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return communityPosts;
}

function loadLiked(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function CommunityView() {
  const [posts, setPosts] = useState<CommunityPost[]>(loadPosts);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [liked, setLiked] = useState<Record<string, boolean>>(loadLiked);
  const [sort, setSort] = useState<SortMode>("time");
  const fileRef = useRef<HTMLInputElement>(null);

  // persist posts
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(posts)); } catch { /* ignore */ }
  }, [posts]);

  // persist liked
  useEffect(() => {
    try { localStorage.setItem(LIKED_KEY, JSON.stringify(liked)); } catch { /* ignore */ }
  }, [liked]);

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => setImages((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const publish = () => {
    if (!draft.trim() && images.length === 0) return;
    const post: CommunityPost = {
      id: `p${Date.now()}`,
      author: "我",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&auto=format",
      tags: parseTags(draft),
      time: "刚刚",
      markdown: draft,
      images,
      likes: 0,
      comments: 0,
    };
    setPosts((p) => [post, ...p]);
    setDraft("");
    setImages([]);
    setPreview(false);
  };

  const toggleLike = (id: string) =>
    setLiked((l) => {
      const next = { ...l, [id]: !l[id] };
      try { localStorage.setItem(LIKED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  // 检索 + 排序
  const q = query.trim().replace(/^#/, "").toLowerCase();
  const filtered = q
    ? posts.filter(
        (p) =>
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.markdown.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q)
      )
    : [...posts];

  const shown = sort === "hot"
    ? [...filtered].sort((a, b) => (b.likes + (liked[b.id] ? 1 : 0)) - (a.likes + (liked[a.id] ? 1 : 0)))
    : filtered; // 时间顺序已是发布顺序（最新在前）

  // 热门标签
  const hotTags = Array.from(new Set(posts.flatMap((p) => p.tags))).slice(0, 12);
  const draftTags = parseTags(draft);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
            <Users className="h-5 w-5 text-primary-foreground" />
          </span>
          <div>
            <h2 className="text-[18px] leading-tight">社区交流平台</h2>
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Community · 用 #标题 标记 · 搜索检索</p>
          </div>
        </div>
        {/* sort toggle */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button
            onClick={() => setSort("time")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] transition"
            style={{ background: sort === "time" ? "var(--primary)" : "transparent", color: sort === "time" ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
          >
            <Clock className="h-3.5 w-3.5" /> 最新
          </button>
          <button
            onClick={() => setSort("hot")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] transition"
            style={{ background: sort === "hot" ? "var(--primary)" : "transparent", color: sort === "hot" ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
          >
            <Flame className="h-3.5 w-3.5" /> 热度
          </button>
        </div>
      </div>

      {/* search */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-sm focus-within:border-[var(--primary)]">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索 #标题、关键词或作者…"
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-muted-foreground transition hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* hot tags */}
      {hotTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">热门:</span>
          {hotTags.map((t) => (
            <button
              key={t}
              onClick={() => setQuery(query === t ? "" : t)}
              className="flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[11px] transition"
              style={{
                background: query === t ? "var(--primary)" : "var(--secondary)",
                color: query === t ? "var(--primary-foreground)" : "var(--muted-foreground)",
              }}
            >
              <Hash className="h-3 w-3" />
              {t}
            </button>
          ))}
        </div>
      )}

      {/* composer */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">发布动态 · 用 <span className="font-mono text-[var(--primary)]">#标题</span> 添加可检索标签</span>
          <button
            onClick={() => setPreview((p) => !p)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {preview ? "编辑" : "预览"}
          </button>
        </div>

        {preview ? (
          <div className="min-h-[96px] rounded-xl border border-border bg-input-background p-3">
            {draft.trim() ? <Markdown>{draft}</Markdown> : <span className="text-[12px] text-muted-foreground">暂无内容</span>}
          </div>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="#数据结构 分享你的学习心得… 支持 Markdown 与 LaTeX 公式($...$ 或 $$...$$)"
            className="w-full resize-none rounded-xl border border-border bg-input-background p-3 text-[13px] text-foreground outline-none transition focus:border-[var(--primary)] placeholder:text-muted-foreground"
          />
        )}

        {draftTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {draftTags.map((t) => (
              <span key={t} className="flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-[var(--primary)]"><Hash className="h-2.5 w-2.5" />{t}</span>
            ))}
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                <ImageWithFallback src={src} alt="上传预览" className="h-full w-full object-cover" />
                <button
                  onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              <ImagePlus className="h-3.5 w-3.5" /> 图片
            </button>
            <button
              onClick={() => setDraft((d) => d + (d ? "\n\n" : "") + SAMPLE)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              <Sigma className="h-3.5 w-3.5" /> 插入公式示例
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          </div>
          <button
            onClick={publish}
            className="rounded-xl px-4 py-1.5 text-[12px] font-medium transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "var(--primary-foreground)" }}
          >
            发布
          </button>
        </div>
      </section>

      {/* feed */}
      <div className="space-y-3 pb-4">
        {shown.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
            没有匹配「{query}」的动态
          </div>
        )}
        {shown.map((post, i) => (
          <motion.article
            key={post.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center gap-3">
              <ImageWithFallback src={post.avatar} alt={post.author} className="h-9 w-9 rounded-full object-cover" />
              <div className="flex-1">
                <span className="text-[13px] font-medium text-foreground">{post.author}</span>
                <span className="block font-mono text-[10px] text-muted-foreground">{post.time}</span>
              </div>
            </div>

            {post.tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {post.tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setQuery(t)}
                    className="flex items-center gap-0.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-[var(--primary)] transition hover:opacity-80"
                  >
                    <Hash className="h-2.5 w-2.5" />{t}
                  </button>
                ))}
              </div>
            )}

            <Markdown>{stripLeadingTags(post.markdown)}</Markdown>

            {post.images.length > 0 && (
              <div className={`mt-3 grid gap-2 ${post.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {post.images.map((src, j) => (
                  <div key={j} className="overflow-hidden rounded-xl border border-border bg-secondary">
                    <ImageWithFallback src={src} alt="帖子配图" className="max-h-72 w-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-5 border-t border-border pt-3 text-[12px] text-muted-foreground">
              <button onClick={() => toggleLike(post.id)} className="flex items-center gap-1.5 transition hover:text-[var(--destructive)]">
                <Heart className="h-4 w-4" style={liked[post.id] ? { fill: "var(--destructive)", color: "var(--destructive)" } : undefined} />
                {post.likes + (liked[post.id] ? 1 : 0)}
              </button>
              <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> {post.comments}</span>
              <button className="flex items-center gap-1.5 transition hover:text-foreground"><Share2 className="h-4 w-4" /> 分享</button>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}

// 正文已用标签 chip 展示,渲染时去掉开头的 #标题 行避免重复
function stripLeadingTags(md: string): string {
  return md.replace(/^(?:\s*#[^\s#]+)+\s*\n+/, "");
}
