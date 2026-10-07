# Conference demo flows

Tony can walk these without Ahrefs, Gmail, or a live traffic pipeline. Paths are workspace-relative. From the repo root, `pnpm dev`, then open the path.

The Beam demo workspace keeps the slug `northwind` so the existing seed still loads. New tickets use Sundrift product titles. The roster emails stay on `@northwind.test` placeholders.

## 1. SEO research

**Goal:** Show opportunity research for a travel keyword, then a finished report.

**Apps:** SEO (`/seo`).

**Sample prompts and actions:**

- Open `/seo` or `/seo/research`. Dispatch home is `/research`, so it does not open Agent chat.
- The form starts empty, matching the ecom demo. Type `linen travel shirts` (or `weekender bags` / `packing cubes`) and press Start research. Country codes are United States, Canada, and Mexico.
- Agent: "Get the linen travel shirts research" → `get-research` or `get-research-request` with `research_linen_travel_shirts`. `create-research-request` and `list-opportunity-reports` are the ecom-demo action names.
- On the report, Answer this SEO request opens the agent sidebar. Save response writes locally.

**Mocked:** Volume, keyword difficulty, related terms, and the SERP snapshot (Harbor Supply, Northline Travel, Fieldnote Co.) come from the Sundrift catalog. `AHREFS_API_KEY` can be stored and is not called.

**Live:** The agent sidebar, if a model provider is configured on the machine. Navigation, saves, and the audit row created for a new keyword.

## 2. Mail import into the audit log

**Goal:** Show merchandising email requests landing next to SEO requests.

**Apps:** SEO. Mail is represented by a seeded import, not the Mail app.

**Sample prompts and actions:**

- Open `/seo/audit-log`.
- Import mailbox. That restores the packing-cubes email and the Weekender holiday landing request if they were deleted.
- Select rows and Complete selected, or complete one row.
- Send → Copy, Email (mailto draft, nothing is sent), or Slack (returns the body and does not post).
- Agent: "List the SEO audit log" → `list-audit-log`. "Import the mailbox requests" → `import-mailbox-requests`.

**Mocked:** Both email rows. No Gmail read. Slack delivery.

**Live:** Complete, trash, and the detail panel for `?requestId=`.

## 3. Campaign revenue simulator

**Goal:** Project The Weekender from the seeded baseline.

**Apps:** Campaign Planner (`/campaign-planner`). The baseline matches the Analytics seed.

**Sample prompts and actions:**

- Open `/campaign-planner` or `/campaign-planner/campaigns`. The list is the planning checklist from the ecom demo: market research, financial model, brand messaging, SEO, prototypes, design, and deploy. Seeded rows have the financial model and SEO marks filled. Market research, messaging, prototypes, design, and deploy stay open.
- New campaign collects a name, keywords, and description, then `create-campaign` attaches the closest catalog product and opens the simulator. Lifts start at zero.
- Open `/campaign-planner/campaign/campaign_weekender_midwest` for the hero simulator.
- Baseline: 9,421 sessions, 4.52% conversion, $52.37 AOV, last 180 days.
- Default lifts: sessions +12.4%, conversion +1.6 percentage points, AOV +3.9%. Simulated point: 10,589 sessions, 6.12%, $54.41.
- Move a slider. The page updates immediately and saves the lifts.
- Mark Complete is local. Research similar campaigns opens the agent.
- Agent: "Get the Weekender campaign simulation" → `get-campaign-simulation` with `campaign_weekender_midwest`.

**Mocked:** Product sessions, conversion, and AOV. The badge says Analytics + local campaign history because the numbers are a snapshot, not a query against live events.

**Live:** Slider save, complete status, and the agent sidebar.

Also seeded: packing cubes and Drift Carry-On campaigns, from `/campaign-planner/campaigns`.

## 4. Product development: Content, Beam, and Plan

**Goal:** A parallel walkthrough for loyalty, packing AI, and returns.

**Apps:** Content, Beam, Plan.

**Sample prompts and actions:**

- If the Beam board is empty: `seed-demo-data` in Beam (creates the existing demo workspace, then the three Sundrift tickets).
- If that workspace already exists: `seed-sundrift-product-dev`.
- `seed-sundrift-prds` in Content. Documents: `/content/page/prd_loyalty`, `/content/page/prd_packing_ai`, `/content/page/prd_returns`.
- `seed-sundrift-plans` in Plan. Plan: `/plan/plans/plan-sundrift-product-dev`.
- Read them back with `list-sundrift-prds`, `list-sundrift-product-dev`, and `get-sundrift-product-plan`.
- Agent prompt: "Seed the Sundrift product walkthrough for loyalty, packing AI, and returns, then open the plan."

**Mocked:** PRD text, ticket descriptions, and the plan body. No carrier, lounge booking, or packing model runs inside these actions.

**Live:** The records, once seeded, are normal Content, Beam, and Plan rows. PRDs and the plan are owned by the signed-in user (local owner when auth is off). Packing AI stays a PRD: the model call, if you demo it, belongs in the agent sidebar.

## 5. Analytics product traffic

**Goal:** Show the same travel SKUs on a dashboard.

**Apps:** Analytics.

**Sample prompts and actions:**

- `list-sundrift-product-metrics` returns sessions, conversion, AOV, and revenue for The Weekender, packing cubes, linen travel shirts, Care+ lounge, The Drift Carry-On, and The Coast Tote.
- `open-sundrift-product-dashboard` opens `/analytics/dashboards/sundrift-product-traffic`.

**Mocked:** Every panel is a constant SQL snapshot. Nothing is ingested from a browser or Ahrefs.

**Live:** The Analytics shell rendering that shipped dashboard.

## Still not in this workspace

The live ecom demo (`agent-native-ecomm-demo.netlify.app`) also mounts these apps. The private source repo could not be cloned from this environment, so they are not copied yet:

- **Market Research** (`/market-research`) — competitor positioning search. Sundrift has no equivalent.
- **Demo Mode** (`/demo-mode`) — re-seed workspace data and show which rows the signed-in user can read.
- **Product Walkthrough** (`/product-walkthrough`) — authored spotlight tours. SEO research inputs already use `data-tour` anchors so a later tour can attach.

Bulk delete on the campaign checklist is not wired. The three seeded campaigns are restored whenever the list loads, so a delete would come back.

Still stubbed inside the apps that are here:

- Live Ahrefs. `generate-request-research` returns the catalog report and does not call the network. `AHREFS_API_KEY` can be stored.
- Live Gmail. Mailbox rows are seeded. Email send is a mailto draft.
- Slack delivery. The audit log returns the body and does not post.
- Live Analytics event ingest. The product dashboard is a constant SQL snapshot. Analytics home is `/ask`, matching the ecom demo.
- Market-research stage on a campaign. The checklist mark stays incomplete.
- Agent-written suggested responses. Catalog text is prewritten. Answer this SEO request is the live model path.

## Catalog

Shared definitions live in `packages/shared/src/demo-catalog.ts`. SEO, Campaign Planner, Analytics, Content, Plan, and Beam read that module so the Weekender numbers stay in one place.
