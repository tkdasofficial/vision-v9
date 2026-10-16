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
