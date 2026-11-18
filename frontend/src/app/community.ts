import { API_BASE } from "./config";

export interface CommunityMember { id: string; nickname: string }
export interface CommunityPost {
  id: string; author: CommunityMember; markdown: string; images: string[]; tags: string[];
  created_at: string; updated_at: string; likes: number; comments: number; bookmarks: number;
  liked: boolean; bookmarked: boolean; is_owner: boolean;
}
export interface CommunityComment {
  id: string; post_id: string; author: CommunityMember; markdown: string; parent_id: string | null;
  created_at: string; deleted: boolean; is_owner: boolean;
}
export interface CommunityPage<T> { items: T[]; total: number; has_more: boolean }

const TOKEN_KEY = "eduweave_community_token_v1";
let token = "";
try { token = localStorage.getItem(TOKEN_KEY) ?? ""; } catch { /* Keep a session in memory when storage is unavailable. */ }
let session: Promise<CommunityMember> | null = null;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("X-Community-Token", token);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}/api/community${path}`, {
    ...options, headers, cache: "no-store", signal: options.signal ?? AbortSignal.timeout(30000),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    const message = typeof detail === "string" ? detail : Array.isArray(detail)
      ? detail.map(item => String(item.msg).replace(/^Value error, /, "")).join("；")
      : `请求未完成（${response.status}），请稍后重试`;
    throw new Error(message);
  }
  return data as T;
}

export function communitySession(): Promise<CommunityMember> {
  if (!session) {
    session = request<{ member: CommunityMember; token?: string }>("/session", { method: "POST" })
      .then(data => {
        if (data.token) {
          token = data.token;
          try { localStorage.setItem(TOKEN_KEY, token); } catch { /* Session remains usable in this tab. */ }
        }
        return data.member;
      }).catch(error => { session = null; throw error; });
  }
  return session;
}

export async function communityRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  await communitySession();
  return request<T>(path, options);
}

export async function updateCommunityProfile(nickname: string) {
  const member = await communityRequest<CommunityMember>("/me", { method: "PATCH", body: JSON.stringify({ nickname }) });
  session = Promise.resolve(member);
  return member;
}

export function communityImageUrl(path: string) { return `${API_BASE}${path}`; }

export function communityPostUrl(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("community_post", id);
  url.hash = "community";
  return url.toString();
}

export function communityTime(value: string) {
  const date = new Date(value);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function errorText(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError") return "请求超时，内容已保留，请重试";
  if (error instanceof TypeError) return "暂时无法连接社区，请检查网络后重试";
  return error instanceof Error ? error.message : "操作未完成，请重试";
}
