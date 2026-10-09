# Motion Studio UI rules

One look everywhere. Build pages from `src/components/kit.tsx` (+ shadcn `components/ui/*`); never re-style a kit piece locally.

## Surfaces and colors
- Page frame: `AppShell` only (the one 22px radius).
- Every card / panel / section / dialog / preview frame: `Panel` (or the same classes: `rounded-xl border bg-card p-4`). `bg-panel` and raw hex surfaces are gone.
- Recessed areas (logs, drop zones, wells, empty states): `bg-field`.
- Colors come from tokens (`primary`, `muted-foreground`, `destructive`, `chart-2`…). Raw hex only for *data*: brand swatches, scene-type colors (`src/lib/sceneColors.ts`), waveforms.

## Radius (4 values only)
| Class | Use |
|---|---|
| `rounded-xl` (16px) | containers: Panel, dialogs, cards in grids, empty states, drop zones, video/preview frames |
| `rounded-lg` (12px) | blocks nested inside a container: list rows, option tiles, inner thumbnails, log box, FilterTabs track |
| `rounded-md` (10px) | controls: buttons, inputs, selects, textareas, tabs, ThumbBadge (shadcn defaults — don't override) |
| `rounded-full` | pills, status dots, avatars, switches, slider thumbs |

No `rounded`, `rounded-sm`, `rounded-2xl`, `rounded-[…]`.

## Spacing (4px grid)
- Page content: `PageBody` (`p-4 sm:p-6`, `gap-5` between blocks). Grids of cards: `gap-4`.
- Inside a Panel: `gap-4` between groups, `gap-3` between fields in a group; `Field` gives `gap-1.5` label→control.
- Inline controls (button rows, chips): `gap-2`.
- List rows / tiles: `p-3`. Panels: `p-4` (never p-3/p-5/p-6 on a Panel).
- Two-column pages: main `flex-1 min-w-0`; side columns have two widths only: `lg:w-72` for navigation lists (Clients list) and `lg:w-96` for side panels (Settings side, Queue log, Styles preview, Create summary). Stack below `lg`.

## Type
- Page title: `PageTitle` (`font-title text-2xl`) + one-line hint `text-sm text-muted-foreground`.
- Panel title: `font-title text-sm` (via `Panel title=`), meta `text-xs` muted.
- Field label: `text-xs text-muted-foreground` (via `Field`). Body `text-sm`. Meta/hints `text-xs`.
- `text-[11px]` only in ThumbBadge and the editor timeline. Nothing smaller.
- User/AI content (ideas, hooks, names, comments, scene text) always `dir="auto"`.

## Buttons
- One lime primary per region: the page header action, or a dialog/form's submit. Card-level actions are `outline` (or `ghost` for icon-only). Lime primaries use `font-title`.
- Sizes: default (h-9) in forms/headers; `size="sm"` (h-8) inside cards and rows; icon-only `size="icon"` / `"icon-sm"` with `aria-label`.
- Destructive actions: in a menu or a `ghost` icon, always confirmed with AlertDialog. The confirm button is `variant="destructive"`, never lime.
- Actions only appear when they can work (e.g. a project with no version has no Edit/Share/Revise).

## Patterns
- Filters (status, kinds, categories): `FilterTabs` — not chips, not shadcn Tabs.
- Empty / first-run: `EmptyState` (icon, title, text, one action). Errors: `ErrorBox` with Retry. Loading: `Skeleton` in the final shape.
- Selects with an "empty" choice: `SelectField emptyLabel=…`.
- Status: `StatusDot` + `StatusLabel`. Thumbnail overlays: `ThumbBadge`.
