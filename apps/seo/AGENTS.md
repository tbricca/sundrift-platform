# SEO

Opportunity research and an audit log for Sundrift travel products. Open `/seo/research`.

Seeded catalog data stands in for Ahrefs and Gmail. `AHREFS_API_KEY` is optional and unused by the demo path.

## Actions

| Action | Purpose |
| --- | --- |
| `list-research` | Past research reports. |
| `get-research` | One report, suggested response, and full write-up. |
| `start-research` | Create or reopen research for a keyword. |
| `update-research` | Save the suggested response locally. |
| `list-audit-log` | SEO and mailbox rows that are not deleted. |
| `import-mailbox-requests` | Restore the seeded email rows. |
| `update-audit-entry` | Complete or soft-delete one row. |
| `complete-audit-entries` | Complete the selected rows. |
| `prepare-audit-delivery` | Email mailto, Slack stub, or copy text. |

Answer this SEO request and any research synthesis go through the agent sidebar. The buttons do not call a model themselves.
