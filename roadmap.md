# Roadmap — Memory, Output Control, Artifacts & Activity Tracking

Spec: user-uploaded VISION memory/output/artifact/activity integration doc (5 tasks, sequential gates).

- [x] Task 1 — Memory integration (chat / permanent / project scopes) + tests
- [x] Task 2 — Output control & response discipline + tests
- [x] Task 3 — Artifact execution & delivery + tests
- [x] Task 4 — Deep-task status & activity history (Title Case labels, collapsed "Worked for Ns") + tests
- [ ] Task 5 — Integrated regression suite + real-user E2E with screenshots
- [ ] Final report

## Task 5 — Real-user verification (final report)
- Login, signup + email verification (MAIL_TOKEN fixed both sides): OK.
- Title Case statuses ("Thinking", "Reasoning"): OK visually.
- PDF of existing story → story.pdf chip, no fake "Writing" status: OK.
- Simple Q&A end-to-end: OK — "2+2" → "Four", with "Worked for 1s" activity row shown.
- BUG (reproducible): "Remember that my favorite color is teal." hangs at "Reasoning" in the UI and never completes; after reload the stuck spinner persists and the reply is missing from chat_messages. Direct fetch of /api/chat with the same payload (mode default, requestId, conversationId) streams fine and fast — so the hang is in the UI/client path for this request kind, not the provider. Not yet fixed.
- Memory recall: unverified because the remember turn never completes (earlier "recall works" was a false positive from composer text).
