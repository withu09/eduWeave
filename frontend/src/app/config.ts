/**
 * Backend address used by every frontend request.
 *
 * - Local development: VITE_API_URL unset -> http://localhost:8000
 * - Competition deployment: built with VITE_API_URL="" -> same origin;
 *   the Nginx gateway proxies /api and /ws to the backend.
 */
const rawApiUrl = import.meta.env.VITE_API_URL;

export const API_BASE: string = (rawApiUrl ?? "http://localhost:8000").replace(/\/+$/, "");

/** Build a WebSocket URL that follows API_BASE (or the current page when same-origin). */
export function wsUrl(path: string): string {
  if (API_BASE) {
    return API_BASE.replace(/^http/, "ws") + path;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}
