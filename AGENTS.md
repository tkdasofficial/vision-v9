<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Read scoped rules in `src/AGENTS.md` and `src/lib/AGENTS.md` before edits; storage rules live there.
- File-job output visibility is decided by the pure `src/lib/builder/file-delivery.ts` policy and enforced in JobCard for both fresh and restored results; runners preserve the request for explicit content opt-in. Why: download delivery must not automatically duplicate file contents in chat.
- Chat attachment Plugins uses one controlled Popover anchored to the composer, selecting via the plugin-chip callback. Why: picker stays above the input without navigation or duplicated send logic.
- Credentials live only in Cloudflare Secrets/Variables or its Secrets Store, read at runtime, never in Lovable secrets. Why: Cloudflare is the credential source of truth.
- GitHub CLI (`gh`) is used only for runtime setup tasks sourced from `tkdasofficial/vision-runtime` (runtime provisioning, its `.github` workflows, `runtime/` and `tests/` material); never for app source, code edits, or day-to-day changes. Why: keeps the app codebase (from `tkdasofficial/vision-v7`) separate from runtime provisioning.

- Page UIs live in `src/pages/<page>/index.tsx` (Admin stays in `src/views/admin/`), reusable UI in `src/components/<name>/index.tsx` (shadcn `ui/` keeps its flat files); route files only wrap a page. Old URLs are mapped once in `src/lib/legacy-routes.ts` and redirected by thin legacy route files; OAuth callbacks, `/auth/verify` and APIs are never redirected. Page access is decided in `src/lib/route-access.ts` and enforced once by `RouteGuard` in `__root.tsx`; a failed session check means retry, never signed out. Why: one rule set, no flashes or false logouts.
- Navigate via `@/lib/router-compat`, never react-router-dom. Why: preserves simple calls over TanStack Router.
- Backend is Cloudflare: one Worker "vision" (root `wrangler.toml`, deploy `npx wrangler deploy` at root) serves the app AND the auth-gateway endpoints (OAuth, /mail, /ai relay, /runtime, /health) — src/server.ts dispatches gateway paths; route files serve them in the nitro build. Off-Worker hosts MUST set API_ORIGIN; `/api/*` forwards via `api-proxy.server.ts`, 503 when missing. Why: API calls never run on the frontend host.
- Host-independent frontend: set `AUTH_ORIGIN` to the public origin (else request origin) and add it to the gateway's `ALLOWED_RETURN_ORIGINS`. Why: host anywhere; only the auth origin changes.
- Sign-in uses PBKDF2 password hashes and hashed session tokens in D1 with an HttpOnly cookie; Google/GitHub OAuth callbacks live at /auth/google/callback and /auth/github/callback; the start endpoint is /api/oauth/$provider. Auth pages live under /auth/* (login, register, forgot-password, verify, reset-password); password reset is two steps: /auth/verify consumes the code and issues a 10-minute single-use HttpOnly reset ticket (hashed in D1 password_reset_tickets), then /auth/reset-password spends it. Why: no third-party auth service; tokens never reach browser scripts.
- All text calls use `ai/orchestrator.server.ts` (sequential providers, collect before fallback, real switch events); files emit creation/validation/saving stages, shown by `components/task-status` with frozen terminal time. Why: no partial output, duplicate side effects or simulated progress.
- Security logic lives in root `security/` (pure TS, store-agnostic, tested in `security/tests`); `src/lib/cloud/security.server.ts` binds it to D1 and the request, and every signup entry point (email + OAuth) calls `evaluateSignup`. Why: one policy for all entry points; decisions stay server-side and testable without D1.
- Enterprise Login state lives server-side in D1 keyed by an HttpOnly attempt cookie; domain ownership is proven only by DNS TXT and OTPs are bound to the attempt (details in `src/lib/AGENTS.md`). Why: the browser never holds verification results.
- Session cookie is SameSite=None + Partitioned with 30-day sliding renewal (refreshed at most daily in getCaller); every sign-in is recorded in D1 login_history with user agent and IP (pruned after 180 days). Why: keeps users signed in, including inside embedded previews; every state-changing endpoint must call assertSameOrigin to replace the CSRF protection Lax used to give.

- Chat replies run detached from the browser (Worker waitUntil; the off-Worker proxy keeps draining SSE after disconnect); the server saves the answer into chat_messages under the client reply id (INSERT OR IGNORE) and records stage/heartbeat/outcome in D1 `chat_generations`; a reopened chat with an unanswered question reads `/api/chat-status` to restore status or show the failure, never resending. Why: reloads never lose, duplicate or freeze a reply.
- All AI (chat, Deep, jobs, vision, transcription) runs on Cloudflare. Off-Worker APIs proxy to API_ORIGIN; helpers use `aiRelayConfig()` → API_ORIGIN `/ai/:provider` or `/ai/run` (legacy AUTH_GATEWAY_URL fallback), with allowlisted AUTH_ORIGIN. Never use hosting keys or call providers off Worker, even after relay failure. Worker bindings override process values. Why: Cloudflare alone holds AI credentials.
