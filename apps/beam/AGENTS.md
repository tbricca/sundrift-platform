# Chat — Agent Guide

Beam is a Linear-style issue tracker built on the chat-first agent-native
template. Chat stays available at `/`, and the tracker lives on its own named
routes.

## Beam: the one architectural rule

There is **no** separate data structure for Backlog, My Issues, cycles,
projects, saved views, list, or board. Every issue surface is one `IssueQuery`
descriptor — `{ filters, grouping, ordering, layout, visibleColumns }` — run
through one engine.

- `app/lib/issue-query.ts` — the descriptor, presets (`myIssuesQuery`,
  `backlogQuery`, `cycleQuery`, `projectIssuesQuery`), and display metadata.
  Pure, shared by client and server.
- `server/issue-engine.ts` — `buildIssueWhere` (the only place filters become
  SQL) and `runIssueQuery` (fetch + group). Status and priority groups keep
  their empty buckets so board columns stay stable.
- `app/components/issues/IssueViewSurface.tsx` — the surface every issue route
  renders. Owns the header controls, URL-backed view state, the filter builder
  and Save view. Routes supply only a title, a context and the base query.
- `app/components/issues/IssueViewEngine.tsx` — one component renders both the
  list and the board over the same grouped result.
- `app/lib/view-url.ts` — serializes the live query as a diff against the
  route's base query, so `/team/ENG/issues` stays clean and
  `?layout=board&priority=high,urgent` says exactly what the user changed. A
  key with an empty value means "explicitly cleared". `?issue=` is never
  touched by view state.
- `SavedView.filters/grouping/ordering/layout/visible_columns` persist exactly
  this shape; `server/saved-views.ts` maps a row to an `IssueQuery` and back.

Visible columns: `app/lib/issue-query.ts` owns `ISSUE_COLUMNS`, the one
registry of renderable row properties, and `toggleColumn`, which rebuilds the
list in registry order. Order matters — the URL diff and the dirty-view check
compare lists positionally, so an out-of-order set would read as a changed
view. `title` is `fixed`, which keeps the list from ever emptying (an empty
`visibleColumns` means "show everything" to the renderer). The Display menu in
`IssueViewSurface` is the only writer; the board honors the subset marked
`board: true` and ignores the rest rather than cramming columns into cards.

Archived issues: `filters.includeArchived` widens a view to include them
alongside normal results — it never means "only archived". It is exposed as
"Show archived" in the Display menu, serialized as `?archived=1`, and stored in
saved views like any other filter. Archiving and unarchiving are both
`update-issue { archived }`; there is no separate action and no archive table.

Filter semantics: filter rows are ANDed, values inside a row are ORed, and
`filters.exclude` holds the negated form ("is not", "excludes") that the engine
renders as `NOT (...)`. Nullable columns get an explicit `IS NULL` arm so
"assignee is not Ana" still returns unassigned issues.

When a new issue surface is requested, compose a query — do not add a table, a
new read action, or a bespoke renderer.

## Beam actions

| Action | Use |
| --- | --- |
| `get-workspace` | Bootstrap read. Call first to resolve team/status/member/label/project/cycle names to ids. |
| `list-issues` | The engine. Takes `{ query }`; returns grouped issues + total. |
| `get-issue` | Full detail by `ENG-142` or raw id: comments, activity, relations, sub-issues. |
| `create-issue` | Allocates the `TEAMKEY-n` identifier atomically. |
| `update-issue` | Patch of optional fields. Derives `completed_at`/`canceled_at` from the target status category and appends activity rows. |
| `create-comment` | Comment + activity row. |
| `list-saved-views` | Own + shared views, each with its `IssueQuery`. |
| `create-saved-view` / `update-saved-view` / `delete-saved-view` | Persist, re-save, rename, rescope or remove a view. |
| `update-favorite` | Favorite/unfavorite an issue, project, team, view or cycle. |
| `list-projects` / `get-project` | Project rows and project detail, both with computed progress. |
| `create-project` / `update-project` | `update-project` is a patch, including `teamIds` for `project_teams`. |
| `create-milestone` / `update-milestone` | `update-milestone` also reorders (`sortOrder`) and deletes (`delete: true`). |
| `create-project-update` / `update-project-update` | Project updates; both keep `projects.health` in sync. |
| `list-cycles` / `get-cycle` | A team's cycles grouped current/upcoming/previous, or one cycle, with computed metrics. Reading also runs cycle maintenance. |
| `create-cycle` / `update-cycle` | Numbers and dates are allocated from the team's settings; `update-cycle` edits the name or dates. |
| `update-team-cycle-settings` | Cycles on/off, length, start weekday, auto-create, auto-rollover. |
| `update-issue-triage` | One review action: `accept` \| `decline` \| `snooze`, with optional status/assignee/priority/project/cycle/`snoozedUntil`/`reason`. |
| `update-team-triage-settings` | Triage on/off and the default triage assignee. |
| `bulk-update-issues` | One patch over many issue ids. Runs each through `update-issue`, so validation and activity are identical. |
| `list-notifications` | The current member's Inbox, filtered all/unread/mentions, with the unread count. |
| `update-notification` | Patch own notifications: read, unread, dismiss. |
| `mark-all-notifications-read` | Clears the current member's unread count. |
| `update-issue-subscription` | Subscribe or unsubscribe a member from an issue's notifications. |
| `search-workspace` | Text search across issues, projects, cycles, saved views and members. Use it to *find* a record; use `list-issues` to *build a view*. |
| `seed-demo-data` | Hidden from the model; `pnpm action seed-demo-data [--force]`. Also adds the Sundrift loyalty, packing AI, and returns tickets when the workspace is created. |
| `seed-sundrift-product-dev` | Idempotent Sundrift product tickets. Use this when the demo workspace already exists. |
| `list-sundrift-product-dev` | Read those three tickets and their issue paths. |

Identity is one `members` table with `kind: human | agent`, so an agent is
assignable anywhere a person is. Auth is disabled; the first human member acts
as the current user.

Two guards sit in front of every issue write, both in `server/issue-writes.ts`
as `issueWritePolicy` so they can be tested without a database:

- **Soft-deleted issues are invisible to writes.** `resolveIssue` /
  `requireIssue` filter `deleted_at` unless the caller passes
  `{ includeDeleted: true }`, which only `get-issue` (so Undo has something to
  render) and `update-issue` (so `deleted: false` can restore) do. A deleted
  issue therefore cannot be edited, parented to, related to, or subscribed to.
- **Version conflicts are caught by compare-and-swap, not by the preflight
  read.** When a caller passes `expectedVersion`, the authoritative UPDATE
  carries `AND version = expected` and a zero-row result raises
  `ConflictError`; the earlier comparison only exists to fail fast and to diff
  activity against the pre-write row. Callers that omit `expectedVersion` keep
  last-write-wins — do not make internal writes version-aware by default.

## Beam projects

Projects are a planning layer over the same issue engine — they add no issue
query path of their own.

- Progress is always derived, never stored: completed non-canceled issues over
  all non-canceled issues (`server/project-progress.ts`). Zero issues reports
  `percent: null` so the UI shows "No issues yet" rather than 0%.
- Milestone progress uses the same helper grouped by `issues.milestone_id`.
- A milestone belongs to exactly one project. `create-issue` and `update-issue`
  reject a milestone owned by another project, and moving an issue to a
  different project (or off projects) clears its milestone. Enforced server
  side, not in the UI.
- `/projects/:id/issues` and the milestone drill-in are `projectQuery(id)` and
  `milestoneQuery(id, milestoneId)` rendered through `IssueViewSurface`.
- Project health and project status are independent fields. Posting or editing
  a project update sets `projects.health` to the latest update's health;
  deleting the latest update falls back to the one before it. Health is still
  directly editable in the header, so no update is required to set it.
- Removing a team from a project never touches that team's issues; it only
  drops the `project_teams` row.

## Beam cycles

Cycles are a team's iterations. Like projects they add no issue query path of
their own: `/team/:key/cycles/:cycleId` is `cycleQuery(cycleId)` on
`IssueViewSurface`.

- Cycle state is derived from the dates by `cycleState()` in `app/lib/cycle.ts`,
  shared by the server and the UI. The `cycles.status` column is only a cache of
  that answer, maintained by `syncTeamCycles`; read paths never trust it
  directly. Write paths deliberately leave it alone.
- Progress is completed non-canceled issues over all non-canceled issues in the
  cycle, counted in one grouped query (`server/cycle-progress.ts`). Estimates
  are aggregated the same way and reported only when at least one issue in the
  cycle carries one.
- Maintenance runs on read: `list-cycles` and `get-cycle` call
  `syncTeamCycles`, which refreshes the cached status, tops the team up to two
  upcoming cycles, and then rolls unfinished issues forward. There is no cron.
- Rollover moves everything that is neither completed nor canceled into the
  next non-finished cycle of the same team, in one bulk UPDATE with no per-issue
  activity rows. It is idempotent because it fires on the status transition:
  the update that records a cycle as `completed` is conditional on its previous
  status, so only one caller can ever claim it.
- Both auto-create and auto-rollover are per-team switches on `teams`, along
  with cycle length and start weekday.
- Cycles within a team may not overlap — that would make "the current cycle"
  ambiguous — and changing cycle dates never touches issue due dates.
- An issue can only belong to one of its own team's cycles; `create-issue` and
  `update-issue` reject anything else.

## Beam triage

Triage is a review queue over the same issues, not a second model. There is no
`triage_issues` table and no separate fetch path: `/team/:key/triage` is
`triageQuery(teamId, scope)` rendered through the usual `IssueViewSurface`.

- State lives on `issues`: `triage_status` (`pending` | `accepted` |
  `declined` | `snoozed`), `triaged_at`, `triaged_by`, `snoozed_until`,
  `triage_source`. `NULL` status means the issue never entered triage, which is
  the normal case.
- **Normal queries exclude unresolved triage centrally.** `IssueQuery.filters.triage`
  is a scope, and leaving it unset means "hide anything still awaiting review".
  `triageClause()` in `server/issue-engine.ts` is the single place this is
  decided, so no preset carries exclusion logic of its own.
- Pending is derived, never swept: `pending` matches `triage_status = 'pending'`
  **or** `snoozed` whose `snoozed_until` has passed. A snoozed issue resurfaces
  on its own; there is no cron.
- `update-issue-triage` owns triage state only. Every ordinary field change —
  status, assignee, priority, project, cycle — is delegated to
  `update-issue.run(...)`, so team-specific statuses, cross-team cycles and
  cross-project milestones are validated exactly once and produce the same
  activity rows.
- Accept defaults to the team's first unstarted status and keeps any values the
  issue already has. Decline moves the issue to the team's first canceled-category
  status; it is never deleted, and comments, activity, source and subscribers
  survive. An optional decline reason is stored as activity metadata.
- Activity types are structured, never prose: `triage_entered`,
  `triage_accepted`, `triage_declined`, `triage_snoozed`.
- Notifications reuse the existing system. Being assigned during Accept notifies
  normally; queue movement itself notifies nobody.
- Entry is explicit. `create-issue` takes `triage: true` and an optional
  `source` (`agent` | `manual` | `api` | …). Human creation is unchanged, and if
  the team has triage disabled the issue is created normally rather than
  rejected. Agent-created issues keep the agent as creator and render as such in
  the queue.
- `teams.triage_enabled` (default false) gates the sidebar entry and the route;
  `teams.default_triage_assignee_id` prefills the accept panel. The sidebar
  pending badge comes from one grouped count in `get-workspace`.

## Beam bulk edits and selection

Selection is client-only interaction state. It is never in the URL and never
implied: `view-screen` reports `selection.selectedIssueIds` and the focused
identifier so the agent can *see* what a user has highlighted, but acting on it
always requires an explicit `bulk-update-issues` call naming the ids. There is
no autonomous mass edit.

- `bulk-update-issues` owns no business logic. It loops the ids through
  `update-issue.run(...)`, so team-specific statuses and cycles, cross-project
  milestones, completion timestamps and per-issue activity rows all behave
  exactly as they do for a single edit.
- Writes are **sequential and not atomic** — neon-http has no multi-statement
  transactions. The result is `{ updated, failed, updatedCount }`; successful
  issues stay updated and each failure carries its identifier and reason. Do
  not describe a bulk write as all-or-nothing.
- `addLabelIds` / `removeLabelIds` preserve an issue's other labels. There is no
  bulk "set labels".
- `cycleTarget: "current" | "next"` resolves each issue's own team's cycle, so a
  selection spanning teams still lands correctly. An issue whose team has no
  such cycle is reported as a failure rather than skipped silently.
- Cross-team selections narrow in the UI: status, cycle and milestone pickers
  switch off with a reason when the selection spans teams (or projects) instead
  of writing something invalid.
- Undo is a single compensating write, not a history. The client records each
  issue's previous value for the fields being changed and replays them through
  the same action.

## Beam realtime

Changes from other people and from agents appear without a reload. There is no
new transport and no second data store: writes still go through actions, reads
still go through action queries, and realtime only says *what to re-read*.

- **Transport**: the framework's existing sync stream (SSE at
  `/_agent-native/events`, poll fallback), the same one `useDbSync` uses in
  `app/root.tsx`. `server/realtime.ts` puts Beam events on it through
  `recordChange`; `app/hooks/use-beam-realtime.tsx` is the single subscriber,
  mounted once in `Layout`. Nothing else subscribes — rows, panes and counters
  react because their query was invalidated.
- **Entities**: issue, comment, notification, project, cycle, saved view.
  Events are published from the existing chokepoints only — `update-issue`,
  `create-issue`, `update-issue-triage`, the comment actions, `notifyMembers`,
  the project writes, the saved-view writes — so there is one emit per real
  change, not one per table row touched.
- **Reconciliation**: a mutation calls `markLocalWrite(id)` before writing, and
  events for that entity are dropped for two seconds. The optimistic patch
  already shows the right thing; refetching underneath it is what produced
  flicker, duplicate rows and lost selection. All of this is decided by pure
  functions in `app/lib/realtime-events.ts`.
- **Ordering**: issue events carry `issueVersion` (deliberately *not* `version`
  — the change log stamps its own cursor under that name). An event whose
  version is not newer than the one this tab already holds is dropped, so an
  out-of-order event cannot roll an issue backwards.
- **Reconnect**: nothing replays the gap, so on reconnect
  `reconnectTargets(pathname, hasOpenIssue)` refetches only what is on screen —
  the active list, the open detail, the Inbox and the workspace counters.
- **Failure**: realtime is best-effort. If the stream is down, actions, reads,
  navigation and optimistic writes all still work and the next refetch repairs
  state. No banner, no retry storm.
- **Invalidation**: handlers never write cache keys inline. `app/lib/query-keys.ts`
  owns every key and exposes `invalidateIssue`, `invalidateIssueLists`,
  `invalidateInbox`, `invalidateProject`, `invalidateCycle`, `invalidateWorkspace`.
- An agent write is an ordinary write: same events, same rows, same activity
  actor. There is no agent channel.
- Open text is never overwritten. `reconcileEditableText` adopts a remote title
  or description only if the field is untouched; otherwise the local draft wins
  and the pane shows a "someone else edited this" notice with a "Use theirs"
  escape. Beam does not do collaborative text editing, presence or cursors.

## Beam Inbox, subscriptions and notifications

Notifications are generated **only** on the server, in `server/notifications.ts`.
Write paths say what happened; that module decides who hears about it. No UI
component ever inserts a notification.

- Types: `issue_assigned`, `issue_mention`, `comment_mention`, `issue_comment`,
  `project_update`. `entity_id` is the navigation target (the issue or the
  project); a comment id travels in `metadata.commentId`.
- Metadata is structured display context (`issueIdentifier`, `issueTitle`,
  `projectName`, `projectHealth`, `excerpt`, `actorName`), never a rendered
  sentence. Copy lives in `app/lib/notification-copy.ts`, so the Inbox renders
  a row without a query per notification.
- `actor_id` is nullable. A system event renders as "Beam"; Beam does not
  invent a member row for itself.
- Delivery is limited to `human` members. Agents are assignable, mentionable
  and subscribable, but no identity can currently read an agent's Inbox. This
  is a filter in `notifyMembers`, not a separate agent notification path.
- Dedupe: one event, one row per recipient. Mentions outrank the generic
  event — mentioned members are passed as `exclude` to the subscriber pass —
  and the actor is always dropped.
- Mentions come from the stored `mentions` id arrays. On edit only
  `newMentionIds(previous, next)` is notified; removing a mention notifies
  nobody and never retracts an existing row.
- `issue_subscribers` is additive: creating, being assigned, commenting or
  being mentioned subscribes you. Reassignment and removed mentions never
  unsubscribe; only `update-issue-subscription` does.
- Project following reuses **Favorites** rather than a second junction table:
  the followers of a project are the members who favorited it, plus its lead.
- Favorites have one reader, `app/hooks/use-favorites.tsx`. Both the sidebar
  and `/favorites` go through it, so an unfavorite patches the shared
  `get-workspace` cache and both surfaces update at once, in the same
  `sort_order`. Every favoritable entity except issues resolves straight out of
  the workspace bootstrap; issues go through `useFavoriteIssues`, which runs one
  ordinary `list-issues` query keyed on the favorited ids (shared between the
  two surfaces, and never issued at all when nothing is starred). Entities that
  no longer exist are dropped rather than rendered as dead links.
- Actions: `list-notifications` (all/unread/mentions + unread count),
  `update-notification` (patch: read, unread, dismiss — scoped to the caller's
  own rows in the WHERE clause), `mark-all-notifications-read`,
  `update-issue-subscription`.
- The Inbox is client-optimistic over `["action", "list-notifications"]`; the
  sidebar badge reads the same cache, and realtime notification events
  invalidate exactly that key.
- **Grouping is presentation only.** `groupCompatible` collapses rows with the
  same type and entity inside a six-hour window; no notification row is ever
  merged, rewritten or deleted, and each keeps its own id and read state.
  Only `issue_comment` and `project_update` group — a mention or an assignment
  is personally directed, so three of them are three things to read.
- Group copy lives with the rest of the copy in `notification-copy.ts`:
  "Ana and Tom commented on ENG-42", "Ana, Tom and 2 others…", "2 new updates
  in Search Revamp". A group of one reads exactly as it did before grouping.
- Opening a group marks every unread row inside it read; `U` toggles the whole
  group; dismissing hides all of its rows. Every one of those fans out to the
  existing `update-notification` action — there is no grouped-notification
  table.
- The sidebar badge counts **notifications, not rows**: one grouped row holding
  four unread notifications still reads `4`.

## Beam global search

Two different questions, two different surfaces, two different keys:
`Mod+K` is the command palette ("what should Beam do?") and `/` is global
search ("where is that record?"). They share no code path.

- `search-workspace` is the only entry point, and it is deliberately *not*
  built on `IssueQuery`. The view engine hides unresolved triage by design;
  search must be able to find it. Search also returns archived, completed and
  canceled issues. Soft-deleted issues are the one exclusion.
- The search-within-a-view box (`?q=`, `filters.search`) is unrelated and
  unchanged: it narrows the current view, it does not leave it.
- SQL selects a wide-but-bounded candidate set; `server/search-rank.ts` decides
  the order. All ranking rules live in that one pure module: exact identifier >
  identifier prefix > name/title exact > prefix > word boundary > substring >
  description > comment. Entity order breaks ties: issues, projects, cycles,
  views, members.
- Identifiers are parsed, not pattern-matched: `ENG-42`, `eng 42` and a bare
  `42` all resolve to an issue number, and a bare number matches that number in
  every team.
- Queries under 2 characters only match identifiers and name prefixes; comments
  are only scanned from 3 characters. `pg_trgm` GIN indexes back the unanchored
  ILIKE on `issues.title`, `issues.description` and `comments.body`.
- A comment match returns the **issue**, flagged `commentMatched`, never a
  comment result. One EXISTS subquery, not a comment fetch per row.
- Defaults are capped per entity (8 issues, 5 projects, 3 cycles, 5 views,
  4 members) and only the columns a result row renders are selected.
- Recent items are localStorage only (`app/lib/search-recents.ts`), capped at 8.
  A recent's stored label can go stale; the entity is authoritative when opened.
- The last query is kept in **sessionStorage** so reopening search in the same
  tab resumes it. Escape closes without erasing; clearing the box clears it; a
  new browser session starts blank. Queries never reach the database.
- Opening a result publishes its team/project/cycle to `readSearchScope()`,
  which the command palette uses **only as a fallback** when route and
  selection say nothing — so status and cycle pickers are correctly scoped
  after jumping straight into an issue overlay. It is dropped on the next
  navigation; there is no sticky "last search team".
- Members have no profile page; selecting one opens My Issues filtered by
  `?assignee=`, which is an ordinary view override rather than a new route.

## Beam keyboard shortcuts

`app/lib/shortcuts.ts` is the only shortcut catalog: id, key token, label,
category and context requirement. Handlers key their maps off `keys(id)`, and
the help sheet, palette hints and tooltips read the same entries — never write
a key literal or a second documentation list.

- Execution stays in `app/hooks/use-shortcuts.tsx`: one window listener and a
  priority stack (`dialog` > `overlay` > `view` > `global`). The first handler
  that returns `true` claims the key.
- Global: `?` shortcut help, `Mod+K` command palette, `/` global search,
  `C` create issue. `?` is Shift+`/`, so the unshifted slash stays free.
  Issue context: `S` status, `P` priority, `A` assignee, `L` add label — these
  open the palette already scoped to that property, so there is one picker.
  List context: `J`/`K` move, `Enter` open, `X` toggle selection, `Shift+J/K`
  extend, `Mod+A` select all. Inbox: the same `J`/`K`/`Enter`, plus `U` to
  mark read or unread. Triage: `A` accept, `D` decline, `Z` snooze — `S` is
  deliberately left to Status. Dialogs: `Mod+Enter` submits.
- Triage keys only bind in the `triage` context, so `A` still means Assignee
  when an issue overlay is open above the queue.
- Escape order is the priority stack: open picker → dialog / palette / help →
  issue overlay → clear selection → clear focus. Handlers that sit below a
  Radix popover check `hasOpenPopover()` and decline.
- Shortcuts are suppressed while typing (`isTypingTarget`: input, textarea,
  select, contenteditable, `role="textbox"`). Only keys a focused component
  owns — `Escape`, `Mod+Enter` — set `allowWhileTyping`.
- Key labels are platform-aware (`keyLabels`): `⌘`/`⌥` on Apple, `Ctrl`/`Alt`
  elsewhere. Render them with `KeyHint` from `app/components/ui/keycap.tsx`.
- Help opens with `?`, from the palette command "Keyboard shortcuts", or
  `openShortcutHelp()`. There is exactly one help surface.

## Beam issue templates

A template is a named set of `create-issue` defaults belonging to one team. It
stores real references (`status_id`, `cycle_id`, `project_id`, `milestone_id`,
`assignee_id`, plus `issue_template_labels`), never an opaque payload, so the
same foreign keys and the same team-ownership rules that protect an issue
protect a template.

- Scope is workspace + one team, shared with the whole team. There are no
  private templates and no permission model.
- `create-issue-template` / `update-issue-template` / `delete-issue-template` /
  `list-issue-templates`. Archiving (`archived: true`) is the reversible
  default; delete is permanent. Archived templates are hidden from selectors
  but still apply for a caller that already holds the id.
- Duplicate is an ordinary `create-issue-template` with the same values under
  `Copy of <name>`. Do not add a duplicate action; a second write path would
  drift from the first.
- A template never changes team. Its references are validated against one team
  at save time, and moving it would invalidate all of them at once.

**Merge precedence** lives in one place, `app/lib/issue-template.ts`, and is
shared by the create dialog and the server so a human and an agent get the same
issue from the same template:

1. explicit input — what the author typed or the caller passed
2. template defaults
3. Beam's normal create defaults

An explicit `null` counts as explicit: clearing the assignee suppresses the
template's value rather than falling through to it. An empty title is treated
as absent, since the field starts empty. A due-date offset resolves to a
concrete date at creation time; nothing dynamic is ever stored on the issue.
The template's milestone applies only when the issue lands in the template's
own project — a caller who redirects the issue elsewhere drops it, because
failing the create over a default nobody chose is the wrong behaviour.

**Stale references.** Templates outlive the things they point at. Writes
validate strictly; reads (`templateDefaults`) drop references that no longer
resolve, so an old template silently omits a field instead of breaking the
create flow. Dropping is never a bypass: whatever survives still goes through
`create-issue`'s own validation.

**Agents** use the same path — `create-issue` takes an optional `templateId`,
and explicit arguments win over it. There is no separate agent template system,
and the agent remains the issue creator. The template rides on the existing
`created` activity as `templateId` / `templateName`; there is no "applied
template" event.

**UI.** Team → Templates (`/team/:teamKey/templates`) lists and edits them with
the same `IssueProperty` pickers the issue surfaces use. Quick-create keeps a
secondary Template control that prefills the form and never gates it — the
dialog still opens on the title field. Only the current team's templates are
offered, so a selection cannot move the issue to another team behind the
author's back. The palette command "Create issue from template" is a nested
flow (team, then template) that hands off to the same dialog rather than
growing a second issue form.

## Beam resource links

One polymorphic table, `entity_links`, carries URL + optional title for both
issues and projects. `ResourceSection` and the four `*-entity-link` actions are
shared by both surfaces; a project-specific copy would be a second thing to
keep in step for no gain.

- Validation is server-side in `server/entity-links.ts`: http and https only,
  the URL is normalised (a bare `example.com/x` becomes https), and the target
  must exist and belong to the workspace. `javascript:` and `data:` are
  rejected there, not only in the form.
- There is no foreign key — the column addresses two tables — so the write path
  resolving the target *is* the constraint.
- Soft-deleted issues keep their links. The rows survive and return with the
  issue on restore; they are simply unreachable while the only route to them is
  the deleted issue's own detail view.
- Ordering is insertion order via `sort_order`. Titles are user text rendered
  as text, external links carry `rel="noopener noreferrer"`, and no remote
  metadata is ever fetched — the title fallback is derived from the URL.

## Beam recurring issues

A rule (`recurring_issue_definitions`) fires on a schedule and creates an
ordinary issue. There is no second issue type and no second write path: the
processor calls `create-issue` like anything else, so validation, labels,
activity, mentions, notifications and realtime are identical to an issue
somebody typed. Provenance is one nullable column, `issues.recurring_definition_id`.

**Templates by reference, never by copy.** A rule stores `template_id`, not the
template's contents. Editing a template changes every future generated issue —
that is the whole reason recurrences point at templates rather than carrying
their own fields. Nothing is snapshotted.

**Cadence** is daily / weekly / monthly with an interval, optional weekdays and
an optional day of month. No cron, no RRULE, no business-day or holiday
calendars. Schedule maths lives in one pure module, `app/lib/recurrence.ts`, and
`describeSchedule` is the single source of the English wording.

**Time zones and DST.** Beam has no date dependency, so `app/lib/recurrence.ts`
builds the only two conversions a scheduler needs on `Intl.DateTimeFormat`,
which carries the IANA database. A rule stores a wall-clock time and an IANA
zone, never an offset, and every occurrence is recomputed from wall-clock
fields — so "9:00 AM" stays 9:00 AM across a DST change while the UTC instant
moves. The two ambiguous days a year are resolved by policy: a time inside the
spring-forward gap fires at the first real instant after it, and an ambiguous
fall-back time takes the first of its two passes. Both are covered by tests.

**Trigger strategy: read-triggered, because there is no scheduler.** The starter
has no cron, queue or worker, so processing hangs off ordinary reads exactly as
`syncTeamCycles` does — from `get-workspace` (every app load) and from
`list-recurring-issues`. The honest consequence is that a rule fires the next
time somebody opens Beam after it comes due, not on the stroke of the clock.
`process-recurring-issues` exists as the one named entry point so that adding a
real scheduler later is a one-line integration; it is `http: false` and
`agentTool: false`, since neither the outside world nor an agent should be able
to make a team's work fire early.

**Idempotency is the unique index**, not application logic. A processor claims
an occurrence by inserting `(definition_id, scheduled_for)` into
`recurring_issue_runs` with `ON CONFLICT DO NOTHING`; exactly one caller gets a
row and the rest skip. Concurrent processors therefore produce one issue with no
locking. A DB test runs three processors at once to prove it.

**Missed runs collapse.** Each pass fires at most ONE occurrence per rule and
then advances `next_run_at` from *now*, so a month of downtime produces one
issue rather than thirty. Skipped slots are not recorded — they never became
work. Re-enabling a paused rule recalculates from now for the same reason;
nothing is ever backfilled.

**Run Now is not the scheduled occurrence.** It records a run with a null
`scheduled_for` and leaves `next_run_at` untouched, so asking for an issue today
does not cancel Monday's. Postgres treats nulls as distinct in a unique index,
which is what lets manual runs coexist with scheduled slots for free.

**Failures are per-occurrence and do not retry in a loop.** A rule whose
template was archived marks that run `failed` with a short reason, stays
enabled, and advances to its next slot — one clear failure per occurrence rather
than a hot loop on every page load. One rule failing never stops another; each
is processed in its own try/catch. The list flags an archived template inline,
and the rule is never silently repointed or deleted.

**Cycle mode**, not a stored cycle id: `none` (default), `current_cycle` or
`next_cycle`, resolved against the rule's own team at creation time by reading
cycle status. Pinning an id would rot as cycles finish.

Archiving a rule is soft and never touches the issues it already made. Generated
issues are ordinary issues in analytics, search and everywhere else — there is
no special-casing, and none should be added.

## Beam cycle membership history

`issues.cycle_id` is the authoritative CURRENT cycle assignment. Every issue
view, filter and progress bar reads it, and none of that changed. Alongside it,
`issue_cycle_memberships` records the intervals behind that column so cycle
planning metrics survive a rollover rewriting it.

One row is one interval: the issue was assigned to that cycle from `added_at`
until `removed_at`, still assigned when `removed_at` is null. A partial unique
index on `(issue_id) WHERE removed_at IS NULL` makes two open memberships
impossible, mirroring the single `cycle_id` column.

Membership tracks ASSIGNMENT, not progress. Completing an issue does not close
its membership, and neither does the cycle ending. Only a change to
`issues.cycle_id` does.

All writes go through `server/issue-cycle-membership.ts`. Nothing else inserts
into the table. The callers are `create-issue` (`created_in_cycle`, or
`recurring` when the recurring processor filed it), `update-issue`
(`cycle_changed`), and rollover in `server/cycle-maintenance.ts`
(`rollover` on both sides). Bulk edits and triage accept already loop through
`update-issue`, so they inherit history for free — do not add special cases for
them. Re-saving an issue into the cycle it is already in writes nothing.

History only exists from `teams.cycle_history_started_at`. The migration opened
one `system` membership per currently-assigned issue with the migration
timestamp as a synthetic `added_at` and stamped the marker. Nothing older was
inferred, because nothing older was recorded. For any cycle that started before
its team marker, `server/cycle-scope.ts` returns no entry at all and the UI says
"Scope history unavailable" — never a zero.

Metric definitions, decided once in `server/cycle-scope.ts`:

- **Committed**: the membership interval covered the cycle start instant.
- **Committed completed**: a committed issue with `completed_at` at or before
  the cycle end. The denominator is FIXED — work that was committed and later
  moved out still counts, uncompleted. Otherwise a team could improve the
  number by pushing unfinished work to the next cycle on the last day.
- **Scope added**: memberships opened after the start and before the end. This
  includes carried-in work, which is also reported separately.
- **Scope removed**: memberships closed inside the window. Finishing is not
  removing.
- **Carried in / out**: memberships opened or closed with a `rollover` reason.
- **Estimates**: summed over committed issues that carry one. Never imputed,
  and omitted entirely when nothing committed was estimated.

Deleted, archived and canceled issues are excluded, matching cycle progress.
Soft delete and archive never rewrite history; the rows stay.

Membership is not user-editable and has no UI. It is derived from ordinary
cycle assignment actions, and cycle changes already produce a readable
`cycle_changed` activity — do not duplicate history into a second event stream.

## Beam analytics

A few fixed metrics, all computed in SQL by `server/analytics.ts` and read
through three actions: `get-team-analytics`, `get-cycle-analytics`,
`get-project-analytics`. No chart builder, no ad hoc filtering, no user-defined
metrics. If a number is on screen, its definition is in that one file.

**No schema was added.** Every metric offered is derivable from columns Beam
already stores (`created_at`, `completed_at`, `canceled_at`, `estimate`,
`status.category`, `team_id`, `project_id`, `cycle_id`, `members.kind`).

Which issues count:

- Soft-deleted issues are excluded everywhere.
- Archived issues are **included**. Archiving tidies a list; it does not rewrite
  what the team shipped last quarter.
- Issues still in triage (`pending`, `snoozed`) are excluded from every delivery
  metric **including "created"** — they are unreviewed intake, not accepted
  work, so counting them would make an intake spike look like extra load. Once
  accepted or declined they count normally, dated by their own `created_at`.
- Canceled issues count only as canceled: never as completed, and never in
  completion-time percentiles.

Each metric is dated by the event it measures, not one shared column, so an
issue created before a window and completed inside it counts once, as a
completion. `completed_at`/`canceled_at` are trustworthy because every status
write funnels through `update-issue`, which sets and clears them from the target
status category.

**Completion rate is `completed / (completed + canceled)`**, over resolutions
that happened inside the window. Read it as "of the work finished with in this
period, how much shipped rather than being dropped". The denominator is
deliberately not "issues created in the window": issues created late in a window
have not had time to finish, which would drag the figure down for reasons
unrelated to delivery. It is `null`, not `0`, when nothing was resolved — a
metric needing observations it does not have renders as an em dash, never a
misleading zero.

Ranges are 7d / 30d / 90d, default 30d, URL-backed as `?range=30d`, and resolved
by `resolveRange` in `app/lib/analytics.ts` into **whole UTC days** ending with
today. Day-aligned rather than rolling N×24h, because a rolling window touches
N+1 calendar days and would put a half-height bar at each end of every chart.
All bucketing is UTC — Beam stores no per-user or workspace time zone, and
inventing one would misfile issues near midnight. 90d buckets weekly.

**Cycles deliberately do not report committed scope, carryover or velocity.**
Beam stores only an issue's *current* `cycle_id`, and `rollIssuesForward` moves
unfinished work into the next cycle with one bulk UPDATE that writes no activity
rows. Nothing records that an issue was ever in an earlier cycle, so after
rollover a finished cycle contains exactly the issues that finished in it and
any "planned vs completed" figure is trivially 100% and meaningless. Fixing this
means recording membership changes at rollover time; that would collect truthful
data going forward and **cannot be backfilled**. Do not approximate it.
Similarly, project analytics cover the issues a project holds *now* — project
reassignment is not recorded either.

Realtime: analytics ride the existing invalidation (`invalidateAnalytics` in
`query-keys.ts`, called from the `issue` case of `use-beam-realtime`). Aggregates
are cheap to refetch and nobody watches a chart for sub-second updates, so
nothing patches an analytics cache and no event type exists for them.

Agents may read all three actions. There are no analytics writes, and no
per-person productivity metric exists: the human/agent split is an operational
breakdown of completions, not a ranking, and building leaderboards or
"performance" comparisons on this data is out of scope by design.

## Beam issue references

`ENG-42` written in a description or comment renders as a link
(`app/lib/issue-refs.ts`, displayed by `MentionText`). Recognition is
display-only: the stored text is untouched and no issue relation is created, so
a reference someone typed never quietly becomes structured data.

Two rules keep false positives out — the prefix must be a real team key in this
workspace ("COVID-19" and "UTF-8" are not), and code spans, fenced blocks and
URLs are skipped. Matching is case-insensitive because Beam's routes accept a
lowercase identifier.

## Beam tests

Two suites, two commands. Keep them separate: unit tests must stay runnable
with no database at all.

- `pnpm test` — pure unit tests (`*.spec.ts`), no database. `vitest.config.ts`
  explicitly excludes `*.integration.spec.ts`.
- `pnpm test:db` — database integration tests, `vitest.db.config.ts`.
- `pnpm test:all` — both, in that order.

**Strategy.** Integration tests run against a real, dedicated Postgres database
(`beam_test`) on the same server as the app, through the same `neon-http`
driver and the same Drizzle migrations. Nothing is mocked; there is no second
ORM and no SQLite substitute, so constraints, partial indexes and trigram
search are the ones production uses. A separate *database* rather than a
separate schema because the neon-http driver ignores
`options=-c search_path=…` and would silently fall back to real data.

**Safety guard.** `resolveTestDatabaseUrl()` in `server/testing/database.ts`
refuses to run when `NODE_ENV=production`, when nothing is configured, when the
database name is not a plain identifier, when the name does not look like a
test database (`/(^|[_-])test($|[_-])/`), or when it resolves to the same
database the app uses. `DATABASE_URL_TEST` wins if set; otherwise the URL is
derived from `DATABASE_URL_UNPOOLED`/`DATABASE_URL` by swapping only the
database name. `server/testing/setup.ts` redirects `DATABASE_URL` before any
module imports the lazy `server/db.ts` proxy, and deliberately leaves
`DATABASE_URL_UNPOOLED` alone — that is the admin connection `CREATE DATABASE`
runs on, and what the guard compares against.

**Isolation.** neon-http is stateless per request, so interactive transactions
(and therefore rollback-per-test) are not available. Tests truncate instead:
`resetTestDatabase()` empties every table, `resetIssueData()` empties only the
issue-level tables. Suites that never change structure seed the fixture once in
`beforeAll` and call `resetIssueData()` in `beforeEach`, which roughly halves
the run. Order never matters.

**Fixture.** `seedTestWorkspace()` builds one deterministic workspace: two
humans plus an agent, ENG and PROD with a five-status workflow and two cycles
each, two projects with a milestone each, two labels. Ids are fixed strings and
every date derives from `NOW` (`2026-03-15`), so nothing depends on the wall
clock. It is not the demo seed — do not grow it into one. `createTestIssue()`
inserts directly, bypassing the action under test.

**Suites** (`server/__tests__/db/`): `issue-writes` (team ownership of status,
cycle and milestone; project/milestone clearing; parent guards; soft-delete
policy; completion and cancel timestamps; activity and no-op suppression),
`version-cas` (atomic compare-and-swap), `triage`, `cycles` (auto-create and
rollover idempotency), `notifications` (recipient policy, ownership, Inbox read
pipeline), `bulk` (partial-success semantics), `issue-query` (filters,
exclusions, ordering, grouping), `views-search-favorites`, `templates` (team
ownership, stale references, merge precedence through the real create path),
`entity-links` (URL safety, target resolution, lifecycle), `constraints`.
`server/testing/harness.integration.spec.ts` covers the guard itself.

**Time.** Where a helper called `new Date()` internally and blocked
deterministic testing it takes an optional `now` — `syncTeamCycles(teamId, now)`
— and production callers pass nothing. Do not build a clock abstraction and do
not sleep in tests.

## Core Rules

- Store large file/blob payloads in configured file/blob storage, not SQL: no
  base64, `data:` URLs, images, video/audio, PDFs, ZIPs, screenshots,
  thumbnails, or replay chunks in app tables, `application_state`, `settings`,
  or `resources`; persist URLs, ids, or handles instead.
- Never hardcode API keys, tokens, webhook URLs, signing secrets, private Builder/internal data, customer data, or credential-looking literals. Use secrets/OAuth/runtime configuration and obvious placeholders in examples.
- Follow the root framework contract: data in SQL, actions first, application
  state for navigation/selection, and shared agent chat for AI work.
- Keep the full-page chat route distinct from domain pages. If a workflow needs
  a page, give it a named route and use the right AgentSidebar for contextual
  AI; domain buttons that call `sendToAgentChat()` should open that sidebar.
- Keep the first viewport sparse and task-focused. Use progressive disclosure
  and domain-specific navigation, and never use sparkle, wand, magic, or robot
  icons as AI affordances.
- Use a sans-first SaaS hierarchy with one restrained visual cue; reserve serif
  type for content previews. Give the AgentSidebar a subtle surface/divider
  boundary, and stack original/generated review vertically by default.
- Every AI-labeled button must call `sendToAgentChat()` with
  `openSidebar: true`; label deterministic local actions as local or preview.
- Scale effort to the task. A small, well-specified change is a short read, the
  edit, and the app's existing checks (`pnpm typecheck`, formatter, existing
  tests) — not a codebase survey, unrequested tests, or browser automation.
- Use actions for app operations and keep frontend/API parity.
- Do not add `/api/*` routes for app data. If you are about to create a file
  under `server/routes/api/`, or middleware to guard one, stop and write a
  `defineAction` instead. The only exceptions are uploads, streaming, inbound
  webhooks, OAuth callbacks, public unauthenticated URLs, and non-JSON
  responses — not auth, settings, search, or CRUD.
- Treat the chat as the default UI. When the user asks for a capability, prefer
  adding or improving the action surface first, then add a page, table, form, or
  widget only when the user needs to inspect, compare, approve, or share durable
  objects.
- If the user wants to plug in their own agent backend, keep the app shell and
  thread UI intact and adapt the chat through the framework's `AgentChatRuntime`
  connector helpers instead of forking the transcript/composer UI.
- Keep the action surface small and orthogonal: every action is a tool in the
  model's context window, so prefer one CRUD-style `update` (patch of fields)
  over many per-field actions, reach for an existing generic query / escape
  hatch (`provider-api-*`, dev `db-query`) before minting a new read action,
  mark UI-only or programmatic actions `agentTool: false` to hide them from the
  model (distinct from `toolCallable: false`, which only gates the extension
  iframe), and delete or hide actions the UI no longer uses. See the `actions`
  skill.
- Keep database code provider-agnostic and additive.
- Use `view-screen` or application state when the active page/selection is
  unclear.
- For new features, update UI, actions, skills/instructions, and application
  state when applicable.

## Application State

- `navigation` should describe the current view and selected entity ids. The
  default chat view is `chat` at `/`.
- `navigate` may be used to move the UI when the app supports it.
- `view-screen` is the first tool to call when the user's visible context
  matters.

## Framework Docs Lookup

- Before implementing or explaining non-trivial Agent Native behavior, use the
  `agent-native-docs` skill and the built-in `docs-search` action/tool to read
  the version-matched framework docs bundled with `@agent-native/core`.
- Use the built-in `source-search` action/tool, or search
  `node_modules/@agent-native/core/corpus`, when you need current core or
  first-party template implementation examples.
- Prefer those installed docs over memory or public docs when package APIs,
  generated-app conventions, workspaces, actions, or agent surfaces are involved.
- Before building common workspace or agent UI, read `agent-native-toolkit` to
  inventory existing public kits and installed package seams.
- Read `customizing-agent-native` before overriding the chat shell or shared UI.
  Keep Core thread/runtime behavior and use the supported ladder: configure →
  compose → eject the smallest presentation unit → propose a shared seam.
  Preview before `--apply` and commit `agent-native.ejections.json`.

## Skills

Read the relevant root skill before implementation: `adding-a-feature`,
`actions`, `agent-native-docs`, `agent-native-toolkit`,
`customizing-agent-native`, `storing-data`,
`real-time-sync`, `security`, `delegate-to-agent`, `frontend-design`, `shadcn-ui`, and
`self-modifying-code`.
