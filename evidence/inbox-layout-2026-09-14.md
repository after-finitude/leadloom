# Inbox layout correction — 14 September 2026

The user's screenshot showed stacked page chrome, wrapping filters, a permanent pager for one page, and very little room for the list or messages.

## Assessment path

Two independent parallel agents assessed the original layout: one reviewed spacing, hierarchy, structure, rhythm and density; the other ran Impeccable's layout detector. The visual assessment identified excessive fixed chrome and inconsistent panel insets. The mechanical detector returned `[]`, illustrating that the problem was information hierarchy rather than a detected CSS rule violation. The final scoped detector also returned `[]`.

## Implementation and visual assessment

- Hierarchy / squint test: `web/App.svelte` now uses one 18px Inbox heading in the 64px top bar. `web/pages/Inbox.svelte` removes its duplicate heading, description and KPI strip. The selected contact and reply action are the main signals.
- Structure: `.inbox-workspace`, `.inbox-main` and `.inbox` use flex/grid remaining-height sizing. The main surface has two columns; `.inbox-details` is a native popover opened explicitly by Details. Controls, project fields and score remain available there.
- Rhythm / grouping: list rows use 12px vertical and 16px horizontal padding, 4px between name and preview, and 8px before metadata. Conversation sections use 24px desktop insets and 16px on narrower screens. Related controls are grouped inside the details panel.
- Density / breathing room: `LeadTools.svelte` uses a compact select and refresh button in Inbox. `Pagination.svelte` omits pagination when there is only one page. The composer stays visible while the list and messages scroll independently.
- Reading width: `.inbox .message-content` caps text at 65ch. Contact names and preview lines truncate within their columns instead of forcing horizontal overflow.
- Responsive consistency: at 700px and below, the list and conversation become separate panes with Back to list. The top bar keeps a labelled new-enquiry action, displayed as an icon at the narrowest breakpoint.

## Verification

- Production build, TypeScript/Svelte checking and lint passed. Final Svelte check: zero errors, zero warnings.
- Scoped layout detector and `git diff --check` passed.
- Native in-app browser checked at the user's 739×714 viewport, 390×844 mobile, and 1440×900 desktop; temporary viewport overrides were reset.
- At 739×714, five complete conversation rows fit and the messages pane is 429px high. No horizontal overflow was observed there or on the wide desktop.
- Details opens and closes with its button and Escape. An unsent draft remained present after closing Details; the test draft was cleared without sending.
- Mobile Back to list works. Needs attention filtering returns the single matching lead. Details → Open lead reaches the profile and Inbox returns to the list/chat surface.
- No JavaScript errors were recorded in the tested tab. The user's original localhost:3000 tab was left on the updated Inbox.

Scope: this was a layout/interaction correction. The earlier 75-test and mock-provider regression results are documented separately; they were not rerun for this visual change. No commit, push or deployment was performed.
