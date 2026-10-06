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
- Recruiting reuses the strategic RoleMenu for role edits and archives the same role record; this keeps cross-page changes consistent and preserves candidate history.
- Auth is app-owned (`app_users`/`app_sessions`, PBKDF2 hashes, token in localStorage sent as `x-app-session`); do not use Supabase Auth — the app must run on-prem without it.
- All browser data access goes through `db` from `src/lib/db-client.ts` → `dbQuery` server fn, which enforces session, role (owner/hr/manager) and manager scope; tables are not granted to anon/authenticated.
- The data layer is dual-mode: `admin()` in `src/lib/auth.server.ts` returns the direct-PostgreSQL adapter (`src/lib/pg.server.ts`) when `DATABASE_URL` is set, otherwise the cloud Supabase client. All privileged DB access must go through `admin()`/`dbQuery`, never a direct Supabase client import, so both modes stay in sync.
- Bulk people imports use a dedicated owner-only server function that revalidates every row against current organization data, because UI-only hiding and generic writes cannot secure a high-risk batch action.
- Excel role values are preserved in people.appointed_role_title even without a catalog match; role_id links strategic roles and offer_title stores the separate job title, preventing silent loss or invented strategic roles.
- Person data has section ownership enforced in `dbQuery` (`checkSection`): basic info + Career Profile are HR-edited, manager assessment (performance records, skill assessment) is manager-edited, Owner may edit both — because UI-only gating can be bypassed.
- Recruiter role is enforced in `dbQuery` (read allowlist, writes only candidates/candidate_events) and AppShell redirects; managers' candidate reads are filtered to roles in their org scope — UI hiding alone is bypassable.
- Team achievements use dedicated achievement and contributor tables with server-enforced manager scope; achievement types remain configurable in Settings.

- Bulk role imports use a dedicated owner-only server function (upsert by direction + title, auto-creating directions, optional owner linked via people.role_id) for the same reason as people imports.
