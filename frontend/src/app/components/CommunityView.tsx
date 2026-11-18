import { useEffect, useRef, useState } from "react";
import { Users, ImagePlus, Eye, Pencil, X, Sigma, Search, Flame, Clock, RefreshCw, Send, ArrowLeft, Loader2, MessageCircle } from "lucide-react";
import { Markdown } from "./Markdown";
import { parseTags } from "../data";
import { CommunityPostCard, communityButton as buttonClass, communityPrimary as primaryClass, communityInput as inputClass } from "./CommunityPostCard";
import { communitySession, communityRequest, communityImageUrl, updateCommunityProfile, errorText, type CommunityMember, type CommunityPost, type CommunityPage } from "../community";

const DRAFT_KEY = "eduweave_community_draft_v3";
const SAMPLE = "#公式分享\n\n行内公式 $E = mc^2$，块级公式：\n\n$$\\int_0^1 x^2 \\,dx = \\frac{1}{3}$$";

function readDraft(): { markdown: string; images: string[] } {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}");
    return { markdown: typeof value.markdown === "string" ? value.markdown.slice(0, 10000) : "", images: Array.isArray(value.images) ? value.images.filter((url: unknown) => typeof url === "string" && /^\/api\/community\/images\/[a-f0-9-]{36}$/.test(url)).slice(0, 4) : [] };
  } catch { return { markdown: "", images: [] }; }
}

export function CommunityView() {
  const [member, setMember] = useState<CommunityMember | null>(null);
  const [nickname, setNickname] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<"time" | "hot">("time");
  const [scope, setScope] = useState<"all" | "mine" | "bookmarks">("all");
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [sharedId, setSharedId] = useState(() => new URLSearchParams(window.location.search).get("community_post") ?? "");
  const [initialDraft] = useState(readDraft);
  const [draft, setDraft] = useState(initialDraft.markdown);
  const [images, setImages] = useState(initialDraft.images);
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const feedController = useRef<AbortController | null>(null);
  const draftTags = parseTags(draft).slice(0, 10);

  useEffect(() => { const timer = setTimeout(() => setDebounced(query), 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ markdown: draft, images })); } catch { /* Keep the in-memory draft when storage is full. */ } }, [draft, images]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);

  async function load(offset = 0) {
    feedController.current?.abort();
    const controller = new AbortController();
    feedController.current = controller;
    setLoading(true); setFeedError("");
    try {
      const currentMember = await communitySession();
      if (controller.signal.aborted) return;
      setMember(currentMember);
      const page = sharedId
        ? { items: [await communityRequest<CommunityPost>(`/posts/${encodeURIComponent(sharedId)}`, { signal: controller.signal })], total: 1, has_more: false }
        : await communityRequest<CommunityPage<CommunityPost>>(`/posts?${new URLSearchParams({ q: debounced, tag, sort, scope, offset: String(offset) })}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPosts(previous => offset ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items);
      setTotal(page.total); setHasMore(page.has_more);
    } catch (err) { if (!controller.signal.aborted) setFeedError(errorText(err)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { setPosts([]); setHasMore(false); void load(); return () => feedController.current?.abort(); }, [debounced, tag, sort, scope, sharedId, revision]);
  useEffect(() => {
    const controller = new AbortController();
    communityRequest<{ items: { tag: string; count: number }[] }>("/tags", { signal: controller.signal }).then(data => setTags(data.items)).catch(() => {});
    return () => controller.abort();
  }, [revision]);

  function backToFeed() {
    const url = new URL(window.location.href); url.searchParams.delete("community_post"); url.hash = "community";
    window.history.replaceState(null, "", url); setSharedId("");
  }
  function chooseTag(value: string) { if (sharedId) backToFeed(); setTag(value); setQuery(""); setDebounced(""); }

  async function upload(files: FileList | null) {
    if (!files?.length || uploading) return;
    const selected = Array.from(files);
    if (fileRef.current) fileRef.current.value = "";
    if (images.length + selected.length > 4) { setError("每条动态最多添加 4 张图片"); return; }
    if (selected.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError("请选择 JPG、PNG 或 WebP 图片，每张不超过 5 MB"); return; }
    setUploading(true); setError("");
    try {
      for (const file of selected) {
        const body = new FormData(); body.append("file", file);
        const result = await communityRequest<{ url: string }>("/images", { method: "POST", body });
        setImages(previous => [...previous, result.url]);
      }
    } catch (err) { setError(errorText(err)); }
    finally { setUploading(false); }
  }
  async function publish() {
    if (publishing || uploading || (!draft.trim() && !images.length)) return;
    setPublishing(true); setError("");
    try {
      await communityRequest<CommunityPost>("/posts", { method: "POST", body: JSON.stringify({ markdown: draft, images }) });
      setDraft(""); setImages([]); setPreview(false); setNotice("发布成功，大家都可以看到这条动态了");
      backToFeed(); setQuery(""); setDebounced(""); setTag(""); setScope("all"); setSort("time"); setRevision(value => value + 1);
    } catch (err) { setError(errorText(err)); }
    finally { setPublishing(false); }
  }
  async function saveName() {
    if (!nickname.trim() || nameBusy) return;
    setNameBusy(true); setError("");
    try { setMember(await updateCommunityProfile(nickname.trim())); setEditingName(false); setNotice("社区昵称已更新"); setRevision(value => value + 1); }
    catch (err) { setError(errorText(err)); } finally { setNameBusy(false); }
  }
  function updatePost(updated: CommunityPost) {
    setPosts(previous => {
      const next = scope === "bookmarks" && !updated.bookmarked ? previous.filter(post => post.id !== updated.id) : previous.map(post => post.id === updated.id ? updated : post);
      return sort === "hot" ? [...next].sort((a, b) => b.likes - a.likes || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) : next;
    });
    if (scope === "bookmarks" && !updated.bookmarked) { setTotal(value => Math.max(0, value - 1)); setRevision(value => value + 1); }
  }

  return <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto px-1 pb-8 sm:px-2">
    <header className="flex items-center gap-3 pt-1"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Users className="h-5 w-5" /></span><div className="flex-1"><h2 className="text-lg font-medium">社区交流平台</h2><p className="mt-0.5 text-xs text-muted-foreground">分享学习心得，让每一次思考都有回应</p></div><button aria-label="刷新社区" title="刷新社区" disabled={loading} onClick={() => setRevision(value => value + 1)} className={buttonClass}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></header>
    {notice && <p role="status" className="rounded-xl bg-primary/10 px-4 py-3 text-xs text-primary">{notice}</p>}
    <section ref={composerRef} aria-label="发布动态" className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">以</span><span className="text-xs font-medium">{member?.nickname ?? "学习者"}</span><span className="text-xs text-muted-foreground">的身份分享</span><button aria-label="修改社区昵称" disabled={!member || nameBusy} onClick={() => { setNickname(member?.nickname ?? ""); setEditingName(!editingName); }} className="text-primary disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button><button disabled={publishing} onClick={() => setPreview(!preview)} className={`${buttonClass} ml-auto py-1`}>{preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{preview ? "编辑" : "预览"}</button></div>
      {editingName && <div className="mb-3 space-y-2 rounded-xl bg-secondary/50 p-3"><label htmlFor="community-nickname" className="text-xs">社区昵称</label><div className="flex flex-wrap gap-2"><input id="community-nickname" maxLength={24} value={nickname} onChange={event => setNickname(event.target.value)} disabled={nameBusy} className={`${inputClass} min-w-0 flex-1`} /><button className={primaryClass} disabled={nameBusy || !nickname.trim()} onClick={() => void saveName()}>保存昵称</button><button className={buttonClass} disabled={nameBusy} onClick={() => setEditingName(false)}>取消</button></div><p className="text-[10px] text-muted-foreground">身份保存在当前浏览器；昵称会同步更新到已发布的内容。</p></div>}
      {preview ? <div className="min-h-28 break-words rounded-xl border border-border bg-input-background p-3">{draft.trim() ? <Markdown>{draft}</Markdown> : <span className="text-xs text-muted-foreground">暂无文字内容</span>}</div> : <textarea aria-label="动态内容" value={draft} maxLength={10000} disabled={publishing} rows={4} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void publish(); } }} placeholder={"#学习心得 分享你的发现，或向大家提出一个问题…\n支持 Markdown、表格和 LaTeX 公式"} className={`${inputClass} resize-y`} />}
      {!!draftTags.length && <div className="mt-2 flex flex-wrap gap-1.5">{draftTags.map(value => <span key={value} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] text-primary">#{value}</span>)}</div>}
      {!!images.length && <div className="mt-3 flex flex-wrap gap-2">{images.map((src, index) => <div key={src} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border"><img src={communityImageUrl(src)} alt={`待发布图片 ${index + 1}`} className="h-full w-full object-cover" /><button aria-label={`移除图片 ${index + 1}`} disabled={publishing || uploading} onClick={() => setImages(previous => previous.filter(value => value !== src))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"><X className="h-3 w-3" /></button></div>)}</div>}
      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2"><button disabled={publishing || uploading || images.length >= 4 || !member} onClick={() => fileRef.current?.click()} className={buttonClass}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}{uploading ? "上传中…" : `图片 ${images.length}/4`}</button><button disabled={publishing} onClick={() => setDraft(value => (value + (value ? "\n\n" : "") + SAMPLE).slice(0, 10000))} className={buttonClass}><Sigma className="h-3.5 w-3.5" />公式示例</button><input ref={fileRef} aria-label="上传社区图片" type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => void upload(event.target.files)} /><button disabled={!member || publishing || uploading || (!draft.trim() && !images.length)} onClick={() => void publish()} className={`${primaryClass} ml-auto`}><Send className="h-3.5 w-3.5" />{publishing ? "发布中…" : "发布动态"}</button></div>
      <p className="mt-2 text-[10px] text-muted-foreground">{draft.length}/10000 · 草稿自动保存在此浏览器 · 图片每张不超过 5 MB</p>
    </section>
    {sharedId ? <button className={`${buttonClass} self-start`} onClick={backToFeed}><ArrowLeft className="h-3.5 w-3.5" />返回社区动态</button> : <>
      <div className="flex flex-wrap items-center gap-2"><div role="group" aria-label="社区范围" className="flex gap-1 rounded-xl border border-border bg-card p-1">{([ ["all", "全部动态"], ["mine", "我的发布"], ["bookmarks", "我的收藏"] ] as const).map(([key, label]) => <button key={key} aria-pressed={scope === key} onClick={() => setScope(key)} className={`rounded-lg px-3 py-2 text-xs ${scope === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>{label}</button>)}</div><div role="group" aria-label="排序方式" className="ml-auto flex gap-1">{([ ["time", Clock, "最新"], ["hot", Flame, "热门"] ] as const).map(([key, Icon, label]) => <button key={key} aria-pressed={sort === key} onClick={() => setSort(key)} className={`${buttonClass} ${sort === key ? "bg-secondary text-primary" : "text-muted-foreground"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div></div>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 focus-within:border-primary"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input aria-label="搜索社区" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="搜索内容、#话题或作者昵称" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />{query && <button aria-label="清空搜索" onClick={() => setQuery("")}><X className="h-4 w-4 text-muted-foreground" /></button>}</div>
      {(tags.length > 0 || tag) && <div className="flex flex-wrap items-center gap-1.5 text-[11px]"><span className="mr-1 text-muted-foreground">热门话题</span>{tags.map(value => <button key={value.tag} onClick={() => chooseTag(tag === value.tag ? "" : value.tag)} aria-pressed={tag === value.tag} className={`rounded-full px-2.5 py-1 ${tag === value.tag ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>#{value.tag}<span className="ml-1 opacity-60">{value.count}</span></button>)}{tag && <button className="flex items-center gap-1 text-primary" onClick={() => setTag("")}>清除话题：{tag}<X className="h-3 w-3" /></button>}</div>}
    </>}
    {feedError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">{feedError}<button onClick={() => setRevision(value => value + 1)} className={`${buttonClass} ml-3`}>重试</button>{sharedId && <button onClick={backToFeed} className={`${buttonClass} ml-2`}>返回社区</button>}</div>}
    {!loading && !feedError && <p className="text-[11px] text-muted-foreground">{sharedId ? "分享的动态" : `共 ${total} 条动态`}</p>}
    <div className="space-y-4">{posts.map(post => <CommunityPostCard key={post.id} post={post} openComments={!!sharedId} onTag={chooseTag} onNotice={setNotice} onUpdate={updatePost} onDelete={() => { if (sharedId) backToFeed(); setRevision(value => value + 1); }} />)}</div>
    {loading && <div role="status" className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在加载社区…</div>}
    {!loading && !feedError && !posts.length && <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center"><MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm">{query || tag ? "没有找到匹配的动态" : scope === "mine" ? "你还没有发布动态" : scope === "bookmarks" ? "还没有收藏的动态" : "从第一条分享开始"}</p><p className="mt-2 text-xs text-muted-foreground">{query || tag ? "试试其他关键词，或清除筛选。" : scope === "bookmarks" ? "点击动态下方的收藏按钮，方便下次继续阅读。" : "学习心得、疑难问题、公式笔记，都可以在这里交流。"}</p><button onClick={() => { if (query || tag) { setQuery(""); setTag(""); } else composerRef.current?.scrollIntoView({ behavior: "smooth" }); }} className={`${buttonClass} mt-4`}>{query || tag ? "清除筛选" : "写一条动态"}</button></div>}
    {hasMore && <button className={`${buttonClass} self-center`} disabled={loading} onClick={() => void load(posts.length)}>加载更多动态</button>}
  </div>;
}
