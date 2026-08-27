# DESIGN.md — Stagcore

**Companion docs:** PRD.md (what's being built), STACK.md (tech + build order). Read PRD.md first for context on entities and flows referenced below.

## Design Principles

1. **Function over decoration.** No gradients, no shadows-as-decoration, no illustration filler. Every visual element earns its place by carrying information (status, hierarchy, action) or it's cut.
2. **Speed for the cashier, depth for the owner.** POS screens optimize for fewest taps to complete a sale. Dashboard/reports screens can be denser — the owner is analyzing, not racing a queue.
3. **Numbers are load-bearing.** This is an inventory/money app — prices, quantities, IMEIs must be unmistakably legible: tabular figures, high contrast, never decorative fonts on numeric data.
4. **One accent, used sparingly.** Blue signals action and interactive state only (buttons, links, focus rings, active nav). It never appears as decoration or background fill.
5. **Same discipline in both themes.** Light and dark are not reskins of each other — each gets its own tuned surface ladder and text contrast, built from the same semantic tokens.

## Color Tokens

Semantic layer only — components reference role names (`bg-surface`, `text-primary`, `action-primary`), never raw hex. Two physical scales feed the semantic layer: a neutral gray scale and one blue accent scale.

### Light mode

| Token | Value | Role |
|---|---|---|
| `bg-canvas` | `#ffffff` | Page background |
| `bg-surface` | `#f7f7f8` | Cards, panels, table rows |
| `bg-surface-raised` | `#ffffff` | Modals, dropdowns (with border, no shadow-heavy elevation) |
| `border-hairline` | `#e3e3e3` | Dividers, input borders, table lines |
| `text-primary` | `#1a1a1e` | Body text, headings |
| `text-secondary` | `#6b6b74` | Labels, metadata, timestamps |
| `action-primary` | `#2563eb` | Primary buttons, links, active states, focus ring |
| `action-primary-hover` | `#1d4ed8` | Hover/active state of the above |
| `status-success` | `#1a7f4e` | In-stock, completed, positive margin |
| `status-warning` | `#b45309` | Low stock, warranty expiring soon |
| `status-critical` | `#c0290d` | Out of stock, overdue, destructive action |

### Dark mode

| Token | Value | Role |
|---|---|---|
| `bg-canvas` | `#0c0d0f` | Page background |
| `bg-surface` | `#141518` | Cards, panels, table rows |
| `bg-surface-raised` | `#1a1b1f` | Modals, dropdowns |
| `border-hairline` | `#26272c` | Dividers, input borders, table lines |
| `text-primary` | `#f2f2f4` | Body text, headings |
| `text-secondary` | `#8a8a92` | Labels, metadata, timestamps |
| `action-primary` | `#5b8dff` | Primary buttons, links, active states, focus ring (lifted for dark-surface contrast) |
| `action-primary-hover` | `#7ba3ff` | Hover/active state of the above |
| `status-success` | `#3ecf8e` | In-stock, completed, positive margin |
| `status-warning` | `#f0a839` | Low stock, warranty expiring soon |
| `status-critical` | `#f0553a` | Out of stock, overdue, destructive action |

Minimum contrast: 4.5:1 for body text, 3:1 for large text (18px+/bold) and interactive borders, on both themes. Verify `action-primary` against `bg-canvas` and `bg-surface` in both modes before shipping — dark mode needs the lifted blue tint above (a straight desaturated blue fails contrast on near-black).

## Typography

- **Font:** Inter (variable), system-ui fallback stack. Same family for UI and numeric data — no separate display font. Tabular figures (`font-variant-numeric: tabular-nums`) on every price, quantity, and IMEI/serial field so columns of numbers align.
- **Scale** (4px-based, matches spacing grid):

| Token | Size / Weight | Use |
|---|---|---|
| `text-xs` | 12px / 400 | Metadata, timestamps, table captions |
| `text-sm` | 14px / 400–500 | Body text, table cells, form labels |
| `text-base` | 16px / 400 | Default body, input text |
| `text-lg` | 18px / 500–600 | Section headers, card titles |
| `text-xl` | 24px / 600 | Page titles |
| `text-2xl` | 32px / 700 | Dashboard headline numbers (today's sales, profit) |

## Spacing & Radius

- **Spacing scale (4px base):** 4, 8, 12, 16, 24, 32, 48, 64px. No arbitrary values outside this scale.
- **Radius:** `6px` for controls (buttons, inputs, badges), `12px` for containers (cards, modals), `9999px` for pills (status badges, tags).
- **Borders over shadows.** Hairline borders (`border-hairline`) do the elevation work that shadows do in most design systems. Reserve shadow (single soft, low-opacity) for modals/popovers only, never for cards at rest.

## Layout

- **Both desktop and tablet are first-class from day one** — no "mobile-first, desktop later" or vice versa. Two supported breakpoints ship at launch: desktop (≥1024px, cashier counter monitor or owner's laptop) and tablet (768–1023px, roaming/counter tablet). Phone-width (<768px) gets a functional but not optimized fallback in v1 — single-column stacking of the tablet layout is acceptable, no bespoke phone layout required yet.
- **Desktop:** persistent left sidebar nav (Dashboard, Products, Devices, Purchases, Sales, Customers, Suppliers, Reports — plus Warranty/Repairs when enabled per business). Main content area with a top bar for search/IMEI-lookup and user menu.
- **Tablet:** sidebar collapses to a bottom or top icon bar; POS/Sales screen becomes the tablet's primary view when a Cashier logs in — product grid + running cart side-by-side in landscape, stacked in portrait.
- **Touch targets:** minimum 44×44px on tablet-facing controls (POS buttons, numeric keypad, quantity steppers) — this is a touch device on a shop counter, not a mouse-driven admin panel.

## Key Component Specs

- **POS / Sale screen:** Product/device search bar (barcode or IMEI-scan capable) at top → tappable product grid or list → running cart on the right (desktop) or below (tablet portrait) → payment method selector (Cash/MoMo/Card) → large "Complete Sale" button. Selling a serialized item pops a device picker (list of in-stock units by serial/IMEI) instead of a quantity stepper.
- **IMEI/Serial search:** Global search accessible from the top bar on every screen. Typing or scanning an IMEI jumps straight to that device's full history (purchase → sale → warranty → repairs) — this is the single most-used lookup in the product and must never require more than one search action.
- **Low-stock banner/list:** Uses `status-warning` token, shows product name, current stock, minimum level, and a one-tap "Reorder" action that pre-fills a purchase draft.
- **Dashboard summary cards:** Large `text-2xl` numbers (today's sales, profit, inventory value) with a small secondary-text delta/context line underneath. No sparkline charts in v1 — numbers first, visualization later if the pilot asks for it.
- **Status badges:** Pill-shaped (`radius-full`), colored via the semantic status tokens — in-stock/sold/in-repair for devices, active/inactive for products, open/closed for warranty claims and repairs.
- **Feature-flag-hidden modules:** When a business has a feature (Warranty, Repairs, Multi-location, etc.) turned off, its nav item is fully absent — not grayed out, not shown-with-lock-icon. Absence, not a disabled state.

## Interaction & Accessibility

- All interactive elements reachable and operable via keyboard (desktop) — POS speed matters but so does a manager doing back-office work with a keyboard.
- Focus rings always visible (`action-primary` outline), never suppressed for aesthetics.
- Destructive actions (delete product, cancel sale, remove device) require a confirmation step — no silent destructive taps, especially on touch/tablet where mis-taps happen at a counter.
- Toasts/inline confirmations for successful actions (sale completed, stock received) — the cashier needs a fast, unambiguous "it worked" signal since they're moving to the next customer immediately.

## Responsive Behavior Summary

| Breakpoint | Primary user | Nav pattern | POS layout |
|---|---|---|---|
| Desktop ≥1024px | Owner/Manager (back office), Cashier (counter monitor) | Persistent left sidebar | Grid + side cart |
| Tablet 768–1023px | Cashier (roaming/counter) | Collapsed icon bar | Grid + side cart (landscape) / stacked (portrait) |
| Phone <768px | Fallback only, not optimized in v1 | Stacked tablet layout | Functional, not tuned |

## Component Library

**shadcn/ui** on Tailwind (already decided in PRD/STACK) — chosen specifically because it ships unstyled primitives that take the token system above directly, rather than fighting a pre-themed library like Material or Polaris's own React components. Build the semantic token layer as CSS variables first (`globals.css`), then wire shadcn components to those variables — never hardcode a hex value inside a component.
