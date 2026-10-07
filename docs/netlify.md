# Netlify hosting

The workspace site is `sundrift-platform` on tony@builder.io’s personal Netlify account. The repo root `netlify.toml` is what that site builds. Per-app `apps/<app>/netlify.toml` files are only for a standalone deploy of one app.

The private ecom demo repo was not readable from this environment. This file follows that demo’s deploy shape: `agent-native deploy --preset netlify --build-only`, `DATABASE_URL` taken from `NETLIFY_DATABASE_URL`, a release-migration loop, Node 22, and a 300 second function timeout.

## What the build does

1. Maps `DATABASE_URL` from `NETLIFY_DATABASE_URL` when that variable is set.
2. Installs with `pnpm install --frozen-lockfile`.
3. Runs `pnpm exec agent-native deploy --preset netlify --build-only`.
4. On a production deploy, or when `AGENT_NATIVE_RUN_RELEASE_MIGRATIONS=1`, runs `migrate:production` for every app under `apps/` that defines that script. Migrations prefer `NETLIFY_DATABASE_URL_UNPOOLED` so Neon’s pooled URL is not used for DDL.

Publish directory is `dist`. Functions directory is `.netlify/functions-internal`. One function is emitted per app. `/` redirects to `/dispatch/overview` because Dispatch is in the workspace.

Apps included in the build:

`analytics`, `assets`, `beam`, `brain`, `calendar`, `campaign-planner`, `chat`, `clips`, `content`, `design`, `dispatch`, `forms`, `mail`, `plan`, `seo`, `slides`.

Beam is built and served, but it has no `migrate:production` script, so the release loop skips it. Beam’s Drizzle migrate is `pnpm --filter beam db:migrate` and still needs to be run against the Neon database before Beam can store issues.

## Required site environment

Set these in the Netlify UI. Do not commit values.

| Variable | Why |
| --- | --- |
| `NETLIFY_DATABASE_URL` | Set by the Neon extension. The build copies it to `DATABASE_URL`. |
| `NETLIFY_DATABASE_URL_UNPOOLED` | Preferred for the release-migration loop. Neon provides this next to the pooled URL. |
| `DATABASE_URL` | Only if Neon is not connected. A persistent Postgres URL. Local PGlite is not used in production. |
| `BETTER_AUTH_SECRET` | Session signing. `openssl rand -hex 32`. Required for a production build. |
| `A2A_SECRET` | Shared cross-app signing secret. Same value for every app. `openssl rand -hex 32`. A Netlify production build fails without it. |
| `APP_URL` | Public origin of the site, no path. Example shape: `https://sundrift-platform.netlify.app`. |
| `BETTER_AUTH_URL` | Same origin as `APP_URL` for this one-site workspace. |
| `WORKSPACE_ORG_NAME` | Human-readable organization name. |
| `WORKSPACE_ORG_DOMAIN` | Bare domain, no protocol. |
| `WORKSPACE_OWNER_EMAIL` | Initial owner. For this site, tony@builder.io. |
| `ANTHROPIC_API_KEY` | Agent chat. |
| `OPENAI_API_KEY` | Optional. Apps that call OpenAI engines. |
| `BUILDER_PRIVATE_KEY` | Optional. Builder browser integration. |
| `BUILDER_PUBLIC_KEY` | Optional. Builder browser integration. |
| `AHREFS_API_KEY` | Optional. SEO registers it and the demo does not call Ahrefs. |

`WEBHOOK_BASE_URL`, Slack tokens, and Google or GitHub OAuth client values stay unset until those integrations are turned on. Placeholders live in `.env.example`.

## Still done in the Netlify UI

Creating the site, connecting the GitHub repo `tbricca/sundrift-platform`, and installing the Neon extension are account steps. This repo cannot finish those. After the GitHub link and Neon extension are in place, set the variables above and deploy the PR branch or `main`. The first production deploy runs release migrations. Confirm `/dispatch/overview`, `/seo/research`, and `/campaign-planner/campaigns` on the site origin.
