// Server-only: one D1 round trip for prefs + the chat's project and memory setting (owner-checked).
import { d1 } from "@/lib/cloud/d1.server";
import { resolveScope, projectContextBlock, type MemoryScope, type PermanentMemory } from "./memory";

export async function loadChatContext(userId: string, chatId: string | undefined): Promise<{ prefsRaw: unknown; projectId: string | null; scope: MemoryScope }> {
  const cid = chatId && /^[\w-]{1,64}$/.test(chatId) ? chatId : "";
  const row: any = (await d1(
    `SELECT (SELECT prefs FROM user_settings WHERE user_id = ?1 LIMIT 1) AS prefs,
            p.id AS project_id, p.memory AS memory
     FROM (SELECT 1) LEFT JOIN chat_sessions s ON s.id = ?2 AND s.user_id = ?1
     LEFT JOIN workspace_projects p ON p.id = s.project_id AND p.user_id = ?1`,
    [userId, cid],
  ).catch(() => []))[0];
  const projectId = row?.project_id ?? null;
  return { prefsRaw: row?.prefs ?? null, projectId, scope: resolveScope(projectId, row?.memory) };
}

/** Recent user requests from other chats of the same project, owned by the same user. Fails soft to "". */
export async function loadProjectMemory(userId: string, projectId: string, chatId: string): Promise<string> {
  const rows: any[] = await d1(
    `SELECT s.id AS chatId, s.title AS title, s.project_id AS projectId, m.content AS content
     FROM chat_sessions s JOIN chat_messages m ON m.session_id = s.id
     WHERE s.user_id = ? AND s.project_id = ? AND s.id <> ? AND m.role = 'user'
     ORDER BY m.created_at DESC LIMIT 30`,
    [userId, projectId, chatId],
  ).catch(() => []);
  return projectContextBlock(rows.map((r) => ({ ...r, content: String(r.content ?? ""), title: String(r.title ?? "") })), projectId, chatId);
}

// ---- Permanent memory (user-level, explicit saves only). Fails soft: memory never breaks chat. ----

let memReady: Promise<unknown> | null = null;
const ensureMem = () => (memReady ??= d1(
  "CREATE TABLE IF NOT EXISTS user_memories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)",
).then(() => d1("CREATE INDEX IF NOT EXISTS idx_user_memories_user ON user_memories(user_id, created_at)")).catch((e) => { memReady = null; throw e; }));

/** Loads the user's permanent memories, newest first. Returns [] on any failure. */
export async function loadPermanentMemories(userId: string): Promise<PermanentMemory[]> {
  try {
    await ensureMem();
    const rows: any[] = await d1("SELECT id, content, created_at FROM user_memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", [userId]);
    return rows.map((r) => ({ id: String(r.id), content: String(r.content ?? ""), createdAt: Number(r.created_at) || 0 })).filter((m) => m.content);
  } catch {
    return [];
  }
}

/** Saves an explicitly requested memory. Returns the stored row, or null on failure. */
export async function savePermanentMemory(userId: string, content: string): Promise<PermanentMemory | null> {
  const trimmed = content.trim();
  if (trimmed.length < 2 || trimmed.length > 500) return null;
  try {
    await ensureMem();
    const dup: any[] = await d1("SELECT id FROM user_memories WHERE user_id = ? AND content = ? LIMIT 1", [userId, trimmed]);
    if (dup.length) return { id: String(dup[0].id), content: trimmed, createdAt: Date.now() };
    const mem: PermanentMemory = { id: crypto.randomUUID(), content: trimmed, createdAt: Date.now() };
    await d1("INSERT INTO user_memories (id, user_id, content, created_at) VALUES (?, ?, ?, ?)", [mem.id, userId, mem.content, mem.createdAt]);
    return mem;
  } catch {
    return null;
  }
}
