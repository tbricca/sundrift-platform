# Sundrift

```bash
git clone https://github.com/tbricca/sundrift-platform.git && cd sundrift-platform && pnpm install && pnpm dev
```

Copy `.env` from `.env.example` and fill in secrets.

Beam is at http://127.0.0.1:8080/beam.

Conference walkthroughs are in [docs/demo-flows.md](docs/demo-flows.md). With the workspace gateway running:

- SEO research: `/seo/research`
- SEO audit log: `/seo/audit-log`
- Campaign Planner hero: `/campaign-planner/campaign/campaign_weekender_midwest`
- Seeded product traffic: `/analytics/dashboards/sundrift-product-traffic`

Those surfaces use the Sundrift catalog in `packages/shared/src/demo-catalog.ts`. They do not need an Ahrefs or Gmail key.
