# Roadmap — Memory, Output Control, Artifacts & Activity Tracking

## Current request — Private Google Drive storage
- [ ] Audit output capabilities and all storage paths; reconcile canonical folder tree.
- [ ] Replace final-file D1 fallback with private Drive storage; preserve bounded runtime staging and legacy downloads.
- [ ] Add reliable folder/upload registry, failure handling, metadata recovery, and owner-only upload downloads.
- [ ] Test storage/runtime regressions and full suite; verify live integration when the updated Worker is available.

## Current request — Cloudflare-only AI routing
- [x] Audit AI paths; all three live providers responded through Cloudflare (reported outage not reproduced).
- [x] Unify off-Worker text/tools relay with API_ORIGIN; prioritize Worker settings; document Cloudflare-only execution in AGENTS.md.
- [x] Routing regressions: 56 passed; full suite: 1334 passed, 1 skipped; automatic build OK; signed-in preview chat returned 4 and completed in 2s.

## Current request — File-only delivery
- [x] Default all file creation/transformation replies to file delivery without in-file content.
- [x] Show requested contents underneath the delivered file only on explicit opt-in.
- [x] Run delivery regression tests and full suite; verify file/download rendering through automated tests.
- [ ] Signed-in preview file-generation check — blocked: available test-account sign-in returned to login; no file request ran.

Spec: user-uploaded VISION memory/output/artifact/activity integration doc (5 tasks, sequential gates).

- [x] Task 1 — Memory integration (chat / permanent / project scopes) + tests
- [x] Task 2 — Output control & response discipline + tests
- [x] Task 3 — Artifact execution & delivery + tests
- [x] Task 4 — Deep-task status & activity history (Title Case labels, collapsed "Worked for Ns") + tests
- [x] Task 5 — Integrated regression suite + real-user E2E with screenshots (completed in earlier turns)
- [x] Final report (completed in earlier turns)

## Task 5 — Real-user verification (final report)
- Login, signup + email verification (MAIL_TOKEN fixed both sides): OK.
- Title Case statuses ("Thinking", "Reasoning"): OK visually.
- PDF of existing story → story.pdf chip, no fake "Writing" status: OK.
- Simple Q&A end-to-end: OK — "2+2" → "Four", with "Worked for 1s" activity row shown.
- BUG (reproducible): "Remember that my favorite color is teal." hangs at "Reasoning" in the UI and never completes; after reload the stuck spinner persists and the reply is missing from chat_messages. Direct fetch of /api/chat with the same payload (mode default, requestId, conversationId) streams fine and fast — so the hang is in the UI/client path for this request kind, not the provider. Not yet fixed.
- Memory recall: unverified because the remember turn never completes (earlier "recall works" was a false positive from composer text).

## Fix: memory chat hang (root cause)
- Root cause: the deployed "vision" Worker predated the permanent-memory feature; the code only existed in the repo. Deployed current code (`bun run build` + `npx wrangler deploy`, version e7780a89).
- Verified E2E: "Remember that my favorite color is teal." completes ("Worked for 5s", no hang), row saved in D1 user_memories, no stuck spinner after reload, recall in a brand-new chat answers "Your favorite color is teal." from memory.
- Added fail-soft test: DB unreachable -> savePermanentMemory null, load [] (11/11 pass).
- Full suite: 1263 passed | 1 skipped; production build OK.
- Remaining known limitation (pre-existing, separate from memory): if the page is reloaded mid-generation, the preview proxy aborts the upstream Worker request, so that reply isn't saved; the reload poll then waits up to 15 min. Memory itself is still saved. On the Worker itself (no proxy) replies run detached and survive reloads.

## Reload during generation — done
- [x] Server records generation stage/outcome (chat_generations); /api/chat-status for reconnect
- [x] Preview proxy keeps generation alive after reload; first message of a new chat now carries its chat id (answer was previously never saved server-side)
- [x] Verified: reload mid-answer → live "Writing" status restored → answer appears once; provider failure → clear note, no spinner
