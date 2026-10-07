# Workspace Visual Design Contract

Use this brief when a workspace or app surface is first designed. Read
`.agents/skills/frontend-design/SKILL.md` and its visual-direction reference
before filling it in.

## Shared product context

- Audience and cadence: Sundrift shoppers and the internal team that writes,
  supports, and launches luggage. Demo only.
- Brand voice: calm, practical travel ecommerce. Short sentences.
- Environment: Agent Native app chrome. Do not restyle layouts or type.
- Shared anti-references: a full custom brand system, logo lockups, or
  repainting semantic tokens (`--background`, `--primary`, and the rest).

Sundrift color for a later storefront lives only in `styles/tokens.css`:

- `--sundrift-accent` — warm sun amber
- `--sundrift-sea` — deep water, second accent
- `--sundrift-tint` — soft sand wash

Those variables are imported by each app and are not applied to framework
chrome.

## Sibling direction ledger

| App | Mode | Direction | Palette family |
| --- | ---- | --------- | -------------- |
|     |      |           |                |

## App direction

- Product mode: `operate` | `read` | `persuade` | `experience`
- Direction name:
- Palette family: choose a semantic family that fits the product; do not make
  warm beige plus terracotta the default.
- Type treatment:
- Composition:
- Shape language:
- Anti-references:

Shared workspace chrome stays semantic and neutral unless an explicit brand
system says otherwise. Each app may own its accent and composition, but should
compare sibling apps before reusing either one. Never copy a sibling's
`global.css` palette block or let the most recently generated app become the
workspace default.
