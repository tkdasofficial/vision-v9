// Project Memory behavior. Pure, tested; D1 access lives in memory.server.ts.
//  - "none"    : chat outside any project → own history + personal preferences (unchanged behavior).
//  - "default" : project chat → own history + personal preferences (custom instructions); no other chats.
//  - "project" : project chat → own history + compact context from OTHER chats in the SAME project only;
//                personal custom instructions are NOT applied, so nothing personal leaks into the project.
// Missing/deleted projects or failed lookups fall back to "none" so chat keeps working.
import { fenceUntrusted } from "./context";

export type MemoryScope = "none" | "default" | "project";

// ---- Permanent memory: facts the user explicitly asks to be remembered at the account level. ----
// Only explicit "remember …" phrasing saves; anything else would store guesses as facts.
// Permanent memory is personal, so it is never injected under the "project" scope.

export type PermanentMemory = { id: string; content: string; createdAt: number };

export type MemoryRequest =
  | { action: "save"; content: string }
  | { action: "recall" }
  | { action: "none" };

const SAVE_RE = /^\s*(?:please\s+)?(?:remember|keep in mind|note|don't forget|do not forget)\s*(?:that|this)?:?\s+(.+)$/is;
const RECALL_RE = /^\s*(?:what|do you)\s+(?:do you\s+)?remember\b|^\s*what did i (?:ask|tell) you to remember/i;

/** Detects an explicit permanent-memory request. Returns "none" for ordinary messages. */
export function detectMemoryRequest(text: string): MemoryRequest {
  const t = text.trim();
  if (!t) return { action: "none" };
  if (RECALL_RE.test(t)) return { action: "recall" };
  const m = t.match(SAVE_RE);
  if (m && m[1].trim().length >= 2 && m[1].trim().length <= 500) return { action: "save", content: m[1].trim() };
  return { action: "none" };
}

/**
 * Selects permanent memories relevant to the current message (shared word stems),
 * newest first, capped to the budget. Returns [] when nothing matches — never invents.
 */
export function relevantMemories(memories: PermanentMemory[], text: string, budget = 1500): PermanentMemory[] {
  const words = new Set(text.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  const scored = memories
    .map((m) => ({ m, hits: (m.content.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => words.has(w)).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.m.createdAt - a.m.createdAt);
  const out: PermanentMemory[] = [];
  let used = 0;
  for (const { m } of scored) {
    if (used + m.content.length > budget) break;
    out.push(m);
    used += m.content.length;
  }
  return out;
}

/** Prompt block for recalled permanent memories, fenced as untrusted context. */
export function permanentMemoryBlock(memories: PermanentMemory[]): string {
  if (!memories.length) return "";
  const lines = memories.map((m) => `- ${m.content.replace(/\s+/g, " ").slice(0, 300)}`);
  return `Permanent memory (facts the user explicitly asked to be remembered; the current message wins on conflicts):\n${fenceUntrusted("permanent-memory", lines.join("\n"))}`;
}

export function resolveScope(projectId: string | null | undefined, memory: string | null | undefined): MemoryScope {
  if (!projectId) return "none";
  return memory === "project" ? "project" : "default";
}

export function includesPersonal(scope: MemoryScope): boolean {
  return scope !== "project";
}

export type ProjectNote = { chatId: string; title: string; content: string };

/** Builds the shared project context; rows from other projects or the current chat are ignored defensively. */
export function projectContextBlock(rows: (ProjectNote & { projectId: string })[], projectId: string, currentChatId: string, budget = 6000): string {
  let used = 0;
  const lines: string[] = [];
  for (const r of rows) {
    if (r.projectId !== projectId || r.chatId === currentChatId) continue;
    const line = `- (${r.title.slice(0, 60) || "Untitled chat"}) ${r.content.replace(/\s+/g, " ").slice(0, 400)}`;
    if (used + line.length > budget) break;
    lines.push(line); used += line.length;
  }
  if (!lines.length) return "";
  return `Project memory (earlier requests from other chats in this project; use as background, the current message wins on conflicts):\n${fenceUntrusted("project-memory", lines.join("\n"))}`;
}

// ---- Memory lifecycle: forget / update / conflict / auto-capture / project ranking (pure). ----

export type MemoryCommand =
  | MemoryRequest
  | { action: "forget"; query: string }
  | { action: "forget_all" };

const FORGET_ALL_RE = /^\s*(?:please\s+)?(?:forget|delete|erase|clear|wipe)\s+(?:all\s+(?:of\s+)?(?:your\s+|my\s+)?(?:permanent\s+)?memor(?:y|ies)|everything\s+(?:you\s+)?(?:remember|know)\s+about\s+me)\s*[.!]?\s*$/i;
const FORGET_RE = /^\s*(?:please\s+)?(?:forget|stop remembering)\s+(?:that\s+|about\s+)?(.+?)\s*[.!]?\s*$/is;
const DELETE_MEM_RE = /^\s*(?:please\s+)?(?:delete|remove|erase)\s+(?:the\s+)?(?:memory\s+(?:that|about)\s+)?(.+?)\s+from\s+(?:your\s+|my\s+)?(?:permanent\s+)?memory\s*[.!]?\s*$/is;
const DELETE_MEM2_RE = /^\s*(?:please\s+)?(?:delete|remove|erase)\s+(?:the|my)\s+memory\s+(?:that|about|of)\s+(.+?)\s*[.!]?\s*$/is;
const UPDATE_RE = /^\s*(?:please\s+)?(?:update\s+(?:your\s+|my\s+)?memory(?:\s+to\s+say)?|correction|actually,?\s+remember)\s*(?:that)?:?\s+(.+)$/is;

/** Full memory command detection: save, update (treated as save with conflict replacement), recall, forget. */
export function detectMemoryCommand(text: string): MemoryCommand {
  const t = text.trim();
  if (!t) return { action: "none" };
  if (FORGET_ALL_RE.test(t)) return { action: "forget_all" };
  const del = t.match(DELETE_MEM_RE) ?? t.match(DELETE_MEM2_RE) ?? t.match(FORGET_RE);
  if (del && del[1].trim().length >= 2 && del[1].length <= 300) return { action: "forget", query: del[1].trim() };
  const up = t.match(UPDATE_RE);
  if (up && up[1].trim().length >= 2 && up[1].trim().length <= 500) return { action: "save", content: up[1].trim() };
  return detectMemoryRequest(t);
}

const STOP = new Set(["the", "that", "this", "and", "about", "you", "your", "are", "was", "for", "with", "from", "memory", "remember", "please", "what", "have"]);
const words = (s: string) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w));

/** Subject of a fact ("my favorite color is teal" → "my favorite color"), used to detect conflicts. */
export function memorySubject(content: string): string | null {
  const c = content.toLowerCase().replace(/[.!]+$/, "").trim();
  const m = c.match(/^(.{3,60}?)\s+(?:is|are|=)\s+.+$/) ?? c.match(/^(i (?:live in|work at|work as|am based in|prefer)|call me)\s+.+$/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

export type WritePlan = { kind: "insert" } | { kind: "duplicate"; id: string } | { kind: "replace"; id: string; previous: string };

/** Decides how a new fact lands: exact duplicate → no-op, same subject → replace (latest wins), else insert. */
export function planMemoryWrite(existing: PermanentMemory[], content: string): WritePlan {
  const norm = content.trim().toLowerCase();
  const dup = existing.find((m) => m.content.trim().toLowerCase() === norm);
  if (dup) return { kind: "duplicate", id: dup.id };
  const subj = memorySubject(content);
  if (subj) {
    const same = existing.find((m) => memorySubject(m.content) === subj);
    if (same) return { kind: "replace", id: same.id, previous: same.content };
  }
  return { kind: "insert" };
}

export type ForgetMatch = { kind: "one"; memory: PermanentMemory } | { kind: "none" } | { kind: "ambiguous"; candidates: PermanentMemory[] };

/** Finds the memory a forget request means. Equal best matches → ambiguous (ask, never guess). */
export function matchForget(existing: PermanentMemory[], query: string): ForgetMatch {
  const q = query.trim().toLowerCase();
  const exact = existing.filter((m) => m.content.trim().toLowerCase() === q || memorySubject(m.content) === (memorySubject(q) ?? q));
  if (exact.length === 1) return { kind: "one", memory: exact[0] };
  const qw = new Set(words(query));
  if (!qw.size) return { kind: "none" };
  const scored = existing
    .map((m) => ({ m, hits: [...new Set(words(m.content))].filter((w) => qw.has(w)).length }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return { kind: "none" };
  const top = scored.filter((s) => s.hits === scored[0].hits);
  return top.length === 1 ? { kind: "one", memory: top[0].m } : { kind: "ambiguous", candidates: top.map((s) => s.m).slice(0, 5) };
}

const AUTO_RE = /\b(my name is|call me|i live in|i(?:'m| am) based in|i prefer|my (?:favou?rite|preferred) [a-z]+(?: [a-z]+)? is|i work (?:at|as))\s+([^.!?\n,;]{2,60})/i;

/**
 * Conservative auto-capture of stable first-person facts ("my name is…", "I live in…").
 * Questions, long briefs, hypotheticals and quoted/role-play text are never captured.
 */
export function detectAutoMemory(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 300 || /\?\s*$/.test(t)) return null;
  if (/\b(if|imagine|pretend|suppose|story|character|role-?play|write|example)\b/i.test(t)) return null;
  const m = t.match(AUTO_RE);
  if (!m) return null;
  const fact = `${m[1]} ${m[2].trim()}`.replace(/\s+/g, " ");
  return fact.charAt(0).toUpperCase() + fact.slice(1);
}

export type ProjectRow = ProjectNote & { projectId: string; role: string; createdAt: string };

/**
 * Ranks project rows (user requests AND assistant outputs from other chats of the same project)
 * by relevance to the current message; falls back to the most recent requests as background.
 * Rows from other projects or the current chat are always dropped.
 */
export function rankProjectRows(rows: ProjectRow[], projectId: string, currentChatId: string, text: string, max = 8): ProjectRow[] {
  const own = rows.filter((r) => r.projectId === projectId && r.chatId !== currentChatId && r.content.trim());
  const qw = new Set(words(text));
  const scored = own
    .map((r, i) => ({ r, i, hits: qw.size ? [...new Set(words(`${r.title} ${r.content.slice(0, 4000)}`))].filter((w) => qw.has(w)).length : 0 }))
    .sort((a, b) => b.hits - a.hits || a.i - b.i);
  const relevant = scored.filter((s) => s.hits > 0).slice(0, max).map((s) => s.r);
  if (relevant.length) return relevant;
  return own.filter((r) => r.role === "user").slice(0, 5);
}

/** Prompt block for ranked project rows; assistant outputs keep more text so decisions/code survive. */
export function projectRowsBlock(rows: ProjectRow[], budget = 6000): string {
  let used = 0;
  const lines: string[] = [];
  for (const r of rows) {
    const cap = r.role === "assistant" ? 1200 : 400;
    const who = r.role === "assistant" ? "VISION output" : "User";
    const line = `- [${r.title.slice(0, 60) || "Untitled chat"} · ${who}] ${r.content.replace(/\s+/g, " ").slice(0, cap)}`;
    if (used + line.length > budget) break;
    lines.push(line); used += line.length;
  }
  if (!lines.length) return "";
  return `Project memory (relevant items from other chats in this same project; background only — the current chat's instructions win on conflicts):\n${fenceUntrusted("project-memory", lines.join("\n"))}`;
}
