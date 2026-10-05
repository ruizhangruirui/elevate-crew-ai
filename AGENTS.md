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

## Architecture rules
- Auth is app-owned (`app_users`/`app_sessions`, PBKDF2 hashes, token in localStorage sent as `x-app-session`); do not use Supabase Auth — the app must run on-prem without it.
- All browser data access goes through `db` from `src/lib/db-client.ts` → `dbQuery` server fn, which enforces session, role (owner/hr/manager) and manager scope; tables are not granted to anon/authenticated.
- The data layer is dual-mode: `admin()` in `src/lib/auth.server.ts` returns the direct-PostgreSQL adapter (`src/lib/pg.server.ts`) when `DATABASE_URL` is set, otherwise the cloud Supabase client. All privileged DB access must go through `admin()`/`dbQuery`, never a direct Supabase client import, so both modes stay in sync.
- Bulk people imports use a dedicated owner-only server function that revalidates every row against current organization data, because UI-only hiding and generic writes cannot secure a high-risk batch action.
