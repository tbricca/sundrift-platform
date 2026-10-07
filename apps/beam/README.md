# Beam

A Linear-style issue tracker, built on the chat-first agent-native template.
Teams, cycles, projects, triage, saved views, templates and recurring work — all
of it usable by a person in the browser and by an agent through the same set of
actions.

Chat stays at `/`; the tracker lives on its own named routes.

## What it does

**Issues.** Title, description, status, priority, assignee, estimate, due date,
labels, project, milestone, cycle, parent/sub-issues and relations. Comments
with mentions, an activity feed, resource links, soft delete and archive.

**Teams.** Each team owns its workflow statuses, cycles, templates and issue
identifiers (`ENG-42`). Two teams ship in the demo data: Engineering and
Product.

**Cycles.** Fixed-length iterations that create themselves and roll unfinished
work forward. No cron — maintenance runs off ordinary reads.

**Projects.** Cross-team, with milestones, health, a lead, target dates and
project updates.

**Triage.** An opt-in per-team queue for unreviewed intake. Accept, decline or
snooze; nothing in triage counts as delivery until it is reviewed.

**Recurring issues.** Daily, weekly or monthly rules that file ordinary issues
from a template, with IANA time zones, DST-stable wall-clock scheduling and
durable idempotency.

**Analytics.** Team, cycle and project metrics computed in SQL — completion
rate, median and p75 completion time, and truthful cycle planning figures
(committed scope, committed completion, scope added/removed, carryover) derived
from recorded cycle membership history.

**Inbox.** Notifications from assignment, mentions, comments and subscriptions.

**Search.** Global search across issues, projects, teams and views.

## The one architectural rule

There is no separate data structure for Backlog, My Issues, cycles, projects,
saved views, list or board. Every issue surface is a single `IssueQuery`
descriptor — `{ filters, grouping, ordering, layout, visibleColumns }` — run
through one engine.

- `app/lib/issue-query.ts` — the descriptor and its presets. Pure, shared by
  client and server.
- `server/issue-engine.ts` — the only place filters become SQL.
- `app/components/issues/IssueViewSurface.tsx` — the surface every issue route
  renders; routes supply only a title, a context and a base query.
- `app/lib/view-url.ts` — serializes the live query as a diff against the base,
  so URLs say exactly what the user changed.

A new issue surface is a composed query, not a new table, action or renderer.
`AGENTS.md` is the full architectural reference and is worth reading before
changing anything.

## Navigating the app

| Route | What it is |
| --- | --- |
| `/` | Agent chat, with durable threads |
| `/inbox` | Notifications |
| `/my-issues` | Everything assigned to you |
| `/favorites` | Starred issues, projects and teams |
| `/projects`, `/projects/:id` | Projects, their issues and updates |
| `/views` | Saved views |
| `/team/:key/issues` | The team's issue list or board |
| `/team/:key/backlog` | Backlog |
| `/team/:key/triage` | Triage queue |
| `/team/:key/cycles`, `/cycles/:id` | Cycles and cycle detail |
| `/team/:key/projects` · `/team/:key/views` | Team-scoped projects and views |
| `/team/:key/analytics` | Team and cycle analytics |
| `/team/:key/templates` | Issue templates |
| `/team/:key/recurring` | Recurring issue rules |
| `/issue/:identifier` | Issue detail, e.g. `/issue/ENG-1` |
| `/settings` | Preferences |

The sidebar carries the workspace switcher, search, command palette and Create
issue, then Inbox / My Issues / Favorites, a Workspace group (Projects, Views),
Favorites, your teams, and the chat thread rail.

### Keyboard

`Mod+K` command palette · `/` search · `?` shortcut help · `C` create issue ·
`J`/`K` move · `Enter` open · `X` select · `Shift+J/K` extend selection ·
`S` status · `P` priority · `A` assignee · `L` labels · `Escape` close or clear.

## Agent surface

Every capability is an action in `actions/` — 58 of them — and the agent and the
UI call exactly the same ones. There is no second write path, and no endpoint
the UI can reach that an agent cannot.

Run one from the terminal:

```bash
pnpm action list-issues '{"teamKey":"ENG"}'
pnpm action create-issue '{"teamKey":"ENG","title":"Fix the flaky test"}'
```

A few actions are internal (`http: false, agentTool: false`) because they are
machinery rather than user intent — `process-recurring-issues` is the example.

## Develop locally

```bash
pnpm install
pnpm dev
```

Seed the demo workspace (two teams, projects, cycles, issues):

```bash
pnpm action seed-demo-data '{}'
```

### Everyday commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Pure unit tests (no database) |
| `pnpm test:db` | Integration tests against real Postgres |
| `pnpm test:all` | Both suites |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm action <name> '<json>'` | Invoke any action |

## Stack

React Router 7 and React on the front, Drizzle ORM over Postgres behind, wired
together by [`@agent-native/core`](https://agent-native.com/docs) — which
supplies auth, live sync, application state and the action layer. Twenty-eight
tables in `drizzle/schema.ts`; migrations in `drizzle/migrations/`.

## Testing

Pure logic is tested without a database in `*.spec.ts` next to the code. Write
paths, permissions, idempotency and analytics are tested against real Postgres
in `server/__tests__/db/*.integration.spec.ts`, using the harness in
`server/testing/`. Fixtures are dated from a fixed `NOW`, so nothing depends on
when the suite runs and nothing sleeps.

Full framework docs:
[agent-native.com/docs](https://agent-native.com/docs).
