# Elevate Crew AI

AI Powered Talent Management / Talent Architecture system for strategic role planning, organization capability review, people development, action tracking, and HR/business collaboration.

The application was originally created in Lovable and is now maintained as a normal GitHub codebase. The current production deployment is:

- Vercel: https://elevate-crew-ai.vercel.app/
- Lovable preview: https://elevate-crew-ai.lovable.app
- Repository: https://github.com/ruizhangruirui/elevate-crew-ai

## Product Scope

This product is designed for HRBP, business managers, and organization leaders who need to manage research talent and strategic positions.

Main modules:

- Strategic Roles View: strategic organization, key research directions, target role architecture, role gaps, and role/person coverage.
- Organization Capability View: capability health, team/lab development signals, culture and activity records, and improvement suggestions.
- Organization View: organization/lab/team structure and ownership.
- People View: employee profiles, levels, status, contract type, team, role fit, performance, skills, milestones, lifecycle records, and risk/readiness signals.
- Action Center: HR and business action tracking with owners, due dates, priority, status, and related objects.
- Growth / Intelligence: AI-assisted development and organization insights.
- Settings: users, permissions, configuration, and system governance.

## Technology Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | React 19, TypeScript | Main UI is component-based React. |
| Full-stack framework | TanStack Start, TanStack Router | Used for routes, SSR/server entry, and server functions. |
| Data fetching/state | TanStack React Query | Client-side async data and cache management. |
| Build tool | Vite 8 | Development server and production build pipeline. |
| Lovable integration | `@lovable.dev/vite-tanstack-config` | Provides the Lovable/TanStack/Vite preset, devtools, plugins, env injection, aliases, and Nitro integration. |
| Styling | Tailwind CSS 4, Radix UI, custom components | Utility styling plus accessible primitives. |
| UI utilities | lucide-react, Sonner, Recharts, date-fns | Icons, toast notifications, charts, and date handling. |
| Forms/validation | React Hook Form, Zod | Form state and schema validation. |
| Data backend | Supabase Postgres | Application data is stored in Supabase/Postgres tables. |
| Server data access | Supabase service role client | Sensitive writes and role checks happen server-side only. |
| Authentication | Custom app auth | Uses `app_users` and `app_sessions`, not Supabase Auth. |
| AI integration | Lovable AI Gateway | Server-side AI calls are implemented in `src/lib/ai-gateway.server.ts`. |
| Spreadsheet import | xlsx | Used for Excel-based data workflows. |
| Code quality | ESLint, Prettier, TypeScript | Linting, formatting, and static typing. |

## Architecture Notes

This is not a static-only website. The app uses TanStack Start server functions and a custom server entry, so production must support a server runtime.

Important files:

- `src/routes/`: application routes and screens.
- `src/server.ts`: server entry and SSR error wrapper.
- `src/lib/db-client.ts`: browser-side data facade.
- `src/lib/db.functions.ts`: server-side data gateway, permissions, scoped reads/writes.
- `src/lib/auth.server.ts`: custom login, session, role, and user management.
- `src/lib/ai-gateway.server.ts`: AI gateway integration.
- `src/integrations/supabase/client.ts`: browser Supabase client.
- `src/integrations/supabase/client.server.ts`: server Supabase admin client.
- `supabase/migrations/`: database schema migrations.
- `vite.config.ts`: Lovable/TanStack/Vite configuration.

Security rules in the current codebase:

- Browser code should not write directly to database tables.
- Browser data access goes through `db` from `src/lib/db-client.ts`, which calls the `dbQuery` server function.
- `dbQuery` enforces the logged-in user, app role, and manager scope.
- App roles are currently `owner`, `hr`, and `manager`.
- Authentication is app-owned through `app_users` and `app_sessions`.
- The app stores the session token in browser localStorage and sends it as the `x-app-session` header.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed through `VITE_*` variables or browser bundles.

## Environment Variables

Create a local `.env` or deployment secret set with the variables below. Do not commit real secrets.

Two database modes are supported:

- **Direct PostgreSQL (recommended for on-prem).** Set only `DATABASE_URL`. The server talks straight to your local PostgreSQL through the built-in adapter (`src/lib/pg.server.ts`) — no Supabase runtime, no Supabase keys.
- **Managed cloud database (Lovable preview).** Without `DATABASE_URL`, the app falls back to the cloud database client and needs the Supabase values below.

```bash
# Direct PostgreSQL mode — the only variable the on-prem data layer needs
DATABASE_URL=postgres://app_user:CHANGE_ME@localhost:5432/talent_app

# Public/browser-safe Supabase values (cloud mode only)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=

# Server-side Supabase values (cloud mode only)
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_PROJECT_ID=
SUPABASE_SERVICE_ROLE_KEY=

# Server-side AI integration
LOVABLE_API_KEY=
```

Variable guidance:

- `DATABASE_URL` selects direct-PostgreSQL mode. Add `?sslmode=require` (or higher) only when the connection leaves the machine; plain local connections work without it.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are available to browser code (cloud mode).
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are used by server-side integrations in cloud mode only.
- `LOVABLE_API_KEY` is required for AI features that call the Lovable AI Gateway.
- If migrating away from Lovable credits or Lovable AI Gateway, replace `src/lib/ai-gateway.server.ts` with an internal AI gateway or direct OpenAI-compatible provider before production cutover.

## Local Development

Recommended local prerequisites:

- Node.js 22 LTS
- A package manager. The repository currently contains `bun.lock`, so Bun gives the closest Lovable parity. If IT standardizes on npm or pnpm, regenerate and commit the selected lockfile intentionally instead of mixing package managers in CI.
- Access to the Supabase project or a self-hosted Supabase/Postgres environment.

Install and run:

```bash
git clone https://github.com/ruizhangruirui/elevate-crew-ai.git
cd elevate-crew-ai

# Option A: closest to the current Lovable lockfile
bun install
bun run dev

# Option B: if the team standardizes on npm
npm install
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

`npm run preview` is useful for smoke testing. It should not be treated as the final production process without IT validating the server output and runtime target.

## Database Setup

The application talks to a PostgreSQL database through its own server-side data layer. On-prem, use a plain local PostgreSQL — no Supabase stack is required.

Database migrations (schema only) live in two directories and are applied in filename order:

```text
supabase/migrations/     # core product schema
drizzle/migrations/      # app_users / app_sessions (auth)
```

Apply them all with the idempotent helper script:

```bash
PGHOST=127.0.0.1 PGDATABASE=talent_app PGUSER=postgres \
  scripts/deploy/apply-migrations.sh
```

The script creates the `anon` / `authenticated` / `service_role` roles the migration files reference, applies every migration once, and tracks applied files in `public._migrations_applied` so it is safe to re-run on every deploy. It changes only the schema, never your data.

Recommended database paths:

1. **Direct PostgreSQL (recommended):** a local PostgreSQL instance on the VM, `DATABASE_URL` set, migrations applied with the script above. This is the architecture the data layer is built and tested for.
2. Hosted Supabase (cloud mode): keep the Supabase values instead of `DATABASE_URL` while still developing in the Lovable preview.

## Recommended VM Deployment

For IT migration from Lovable to a company server VM, use a server deployment, not a static-file deployment.

Recommended production shape:

```text
Intranet (no public internet exposure)
        |
      Nginx
        |
 Node/TanStack Start application process  (DATABASE_URL set)
        |
 Local PostgreSQL on the same VM or an internal database VM
        |
 Optional AI Gateway (internal or vendor API)
```

Deployment recommendations:

- Run the web app as a Node-compatible server process or container behind Nginx.
- Use Nginx for TLS, compression, request limits, and reverse proxying. Bind Nginx to the internal network only; do not expose the app or PostgreSQL to the public internet.
- Use systemd, PM2, Docker, or Podman for process supervision and automatic restarts.
- Store environment variables in the VM secret manager, systemd environment file, Docker secrets, or CI/CD secret store.
- Set `DATABASE_URL` on the app process; PostgreSQL itself only needs to be reachable from the app (same VM or internal network). Restrict database access to the app user with `pg_hba.conf`.
- Do not deploy this app as plain static assets only; server functions and privileged database operations will fail.
- Add PostgreSQL backups before production cutover.
- Add application logs and error monitoring for SSR/server-function failures.

Important runtime note:

The current `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, whose included Nitro setup uses Cloudflare as a default target. Before production on a traditional VM, IT should validate that the production build emits a Node-runnable server output. If the generated server target is not suitable for the VM, change the Nitro/TanStack deployment target to a Node server preset and test again. This is a deployment-target adjustment, not a product rewrite.

## Suggested Migration Plan

1. Freeze Lovable as an editor during the migration window, or clearly decide whether GitHub or Lovable is the source of truth.
2. Pull the latest GitHub `main` branch onto the deployment/build machine.
3. Install PostgreSQL on the VM (or point at an internal database VM) and create an app user/database, e.g. `talent_app`.
4. Apply the full schema: `PGDATABASE=talent_app scripts/deploy/apply-migrations.sh`.
5. Configure server secrets: `DATABASE_URL` (direct-PostgreSQL mode) and the AI gateway key if AI features are used.
6. Build the app with the selected package manager.
7. Run a smoke test:
   - login / first owner setup
   - Strategic Roles page
   - People list and person profile
   - Action Center create/edit workflow
   - AI feature that uses the gateway
8. Put the app behind Nginx with HTTPS.
9. Configure backups, logs, restart policy, and access control.
10. Switch DNS or internal routing after business users validate the VM environment.

## Production Checklist

- `main` branch builds successfully.
- Package manager is standardized.
- Runtime target supports TanStack Start server functions.
- `DATABASE_URL` is configured (or, for cloud mode, the Supabase variables).
- Database migrations are applied (`scripts/deploy/apply-migrations.sh` reports nothing pending).
- First owner/admin account is created through the app setup flow.
- HR, manager, and owner permissions are smoke tested.
- AI gateway is configured or intentionally disabled/replaced.
- Nginx or equivalent reverse proxy is configured.
- HTTPS certificate is installed.
- Database backups are scheduled and restore-tested.
- Logs are accessible to IT.
- Lovable/GitHub sync ownership is clear to avoid overwriting work.

## Common Issues

### GitHub Pages looks broken or incomplete

GitHub Pages is static hosting. This app requires server functions, SSR/server entry behavior, and server-only environment variables. Use Vercel, Lovable, or a VM/server runtime instead.

### The app opens but data operations fail

Check the server-side environment first:

- Direct-PostgreSQL mode: `DATABASE_URL` must be set on the app process and point at a reachable PostgreSQL with the migrations applied.
- Cloud mode: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

If the error mentions "missing Supabase environment variables", the process is in cloud mode without those variables — set `DATABASE_URL` to switch it to direct-PostgreSQL mode. Also confirm migrations were applied (`public._migrations_applied` should list every migration file).

### Login works in one environment but not another

Sessions are stored in `app_sessions`, and the browser sends a localStorage token through `x-app-session`. If the database changes between environments, users may need to log out and log in again. If `app_users` is empty, the app should go through first-owner setup.

### AI features show a configuration error

Set `LOVABLE_API_KEY`, or replace `src/lib/ai-gateway.server.ts` with the company's chosen AI gateway/provider.

### Lovable preview and GitHub/Vercel are different

Lovable syncs through Git commits. Avoid force pushing or rewriting published history, because that can confuse Lovable's project history. Keep `main` in a working state and verify that Lovable, GitHub, and Vercel are all pointing at the intended commit.

## Development Commands

```bash
npm run dev       # start local development server
npm run build     # production build
npm run preview   # local preview/smoke test
npm run lint      # lint code
npm run format    # format code
```

## Notes for Future Development

- Keep product logic inside the existing route/module structure unless a larger refactor is planned.
- Keep sensitive database access in server functions.
- Do not move service-role database logic into browser components.
- If the company no longer wants to depend on Lovable AI credits, prioritize replacing the AI gateway adapter while keeping the UI flows unchanged.
- If IT needs a fully internal deployment, self-hosted Supabase plus a Node-compatible app runtime is the lowest-risk migration path.
