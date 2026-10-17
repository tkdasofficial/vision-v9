# Roadmap — Memory, Output Control, Artifacts & Activity Tracking

## Current request — Repair memory and Excel generation
- [ ] Review latest app conversations and identify memory/file-generation failures.
- [ ] Repair chat-level and permanent-memory paths with regression tests.
- [ ] Repair XLSX generation and long-running execution with regression tests.
- [ ] Run regression suite and check automatic build results.
- [ ] Verify signed-in chat recall, new-chat permanent recall, workbook download and reload recovery; requires an available user session.

## Current request — vision-sandbox D1 + long-context generation
- [x] Created "vision-sandbox" D1 (id 4d8098d8-e148-46ea-9e79-b4d35c148c8f), SANDBOX_DB binding in wrangler.toml; schema applied local + remote (6 tables verified live).
- [x] Schema in db/migrations/0001_vision_sandbox.sql: generation_jobs/plans/chunks/context/events/outputs with PKs, FKs, indexes, UNIQUE(job_id, seq), status checks.
- [x] Pipeline in src/lib/sandbox/ (pure generation.ts, store.server.ts, runner.server.ts): outline plan → parallel independent chunks / sequential dependencies → retry failed only → resume from checkpoints → assemble → validate (gaps/order/duplication) → output.
- [x] Endpoints /api/sandbox-generations (+ /$jobId with status/chunks/output/events views and retry/resume/cancel), owner-scoped, same proxy/auth/CSRF conventions as existing routes.
- [x] 17 new tests in src/test/sandbox-generation.test.ts; full suite 1392 passed | 1 skipped; typecheck clean; automatic build OK.
- [ ] Deploy the Worker (`npx wrangler deploy`) so the SANDBOX_DB binding is live; wire a UI entry point to the endpoints (none added — API only so far).

# Roadmap — Memory, Output Control, Artifacts & Activity Tracking

## Current request — Private Google Drive storage
- [x] Audit output capabilities and storage paths; reconcile 115 canonical writable formats.
- [x] Replace final-file D1 fallback with private Drive; preserve bounded runtime staging and legacy downloads; integrate browser exports.
- [x] Add folder/upload reservations, metadata recovery, authenticated downloads, and bounded legacy migration.
- [x] Automated regressions: 1375 passed, 1 skipped; automatic validation build OK.
- [ ] Deploy updated service, initialize Drive folders, migrate legacy finals and verify signed-in downloads — blocked pending deployment authorization; existing Cloudflare Drive settings confirmed present, not changed.

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

## Current request — Autonomous user-level QA for Long Context Generation (500-record Excel)
- [ ] New job type `long_context` routed from chat, driving the vision-sandbox pipeline (plan/chunks in D1, resume on retry)
- [ ] Real .xlsx output stage: catalog planning, per-chunk JSON records, validation (500 rows, 16 cols, unique IDs/SKUs, rating 1-5), writeXlsx with frozen header/filter/widths/formats
- [ ] Tests: pure helpers + pipeline with in-memory sandbox double + request routing + xlsx options
- [ ] Deploy Worker after build passes
- [ ] Playwright QA loop on the deployed app: UI login (credentials from env, never logged), submit workload via chat, observe progress, download workbook, independent validation, reload persistence; RUN→OBSERVE→DIAGNOSE→FIX→RETEST until PASS/BLOCKED; structured final report
