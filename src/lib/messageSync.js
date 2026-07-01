/**
 * Pure helpers for messaging realtime sync. Extracted so they can be unit-tested
 * without needing a Supabase client or DOM. Used by MessagesPage.
 *
 * Guarantees:
 *  - Dedupe by id (server id wins over optimistic temp id with matching content)
 *  - Stable ordering by created_at (ISO strings sort lexicographically)
 *  - History merge preserves still-pending optimistic temps
 */

export const isTempId = (id) => id.startsWith("temp-");

export const sortByCreated = (arr) => [...arr].sort((a, b) => a.created_at.localeCompare(b.created_at));

/**
 * Insert a server-confirmed message into the list.
 * - If id already present, no-op (dedupe rapid duplicate realtime events).
 * - Removes a matching optimistic temp from the same user with identical content.
 */
export function upsertRealtimeMessage(prev, incoming) {
  if (prev.some((m) => m.id === incoming.id)) return prev;
  const withoutTemp = prev.filter(
    (m) => !(isTempId(m.id) && m.user_id === incoming.user_id && m.content === incoming.content)
  );
  return sortByCreated([...withoutTemp, incoming]);
}

/**
 * Merge a freshly fetched history snapshot with any still-pending optimistic
 * temps already in local state. Server messages win on id collision.
 */
export function mergeHistory(prev, history) {
  const temps = prev.filter((m) => isTempId(m.id));
  const byId = new Map();
  for (const m of history) byId.set(m.id, m);
  // Add temps only if no server message already supersedes them
  for (const t of temps) {
    const supersededBy = history.find((h) => h.user_id === t.user_id && h.content === t.content);
    if (!supersededBy) byId.set(t.id, t);
  }
  return sortByCreated(Array.from(byId.values()));
}

export function addOptimistic(prev, temp) {
  if (prev.some((m) => m.id === temp.id)) return prev;
  return sortByCreated([...prev, temp]);
}

export function removeMessage(prev, id) {
  return prev.filter((m) => m.id !== id);
}

/** Parse navigator UA into a compact device descriptor for session tracking. */
export function parseDevice(ua, screenW) {
  const u = ua || "";
  const isTablet = /iPad|Tablet/i.test(u) || (screenW != null && screenW >= 600 && screenW < 1024 && /Mobile/i.test(u));
  const isMobile = !isTablet && /Mobi|Android|iPhone|iPod/i.test(u);
  const type = isTablet ? "Tablet" : isMobile ? "Mobile" : "Desktop";

  let os = "Unknown OS";
  if (/Windows NT/i.test(u)) os = "Windows";
  else if (/Mac OS X/i.test(u) && !isMobile) os = "macOS";
  else if (/Android/i.test(u)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(u)) os = "iOS";
  else if (/Linux/i.test(u)) os = "Linux";

  let browser = "Unknown";
  if (/Edg\//i.test(u)) browser = "Edge";
  else if (/OPR\//i.test(u)) browser = "Opera";
  else if (/Chrome\//i.test(u)) browser = "Chrome";
  else if (/Safari\//i.test(u)) browser = "Safari";
  else if (/Firefox\//i.test(u)) browser = "Firefox";

  return { type, os, browser, label: `${type} · ${os} · ${browser}` };
}
