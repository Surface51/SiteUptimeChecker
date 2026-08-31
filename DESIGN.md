---
name: Site Uptime Checker
description: A monochrome control-room dashboard for fleet uptime monitoring and web-log analytics, with one signal-red accent.
colors:
  surface-51-red: "#e4312b"
  red-deep: "#c92620"
  red-deepest: "#a31e19"
  red-tint: "#fdecea"
  ink: "#000000"
  paper: "#ffffff"
  paper-sunken: "#f7f7f7"
  hairline: "#dcdcdc"
  gray-mute: "#5c5c5c"
  gray-faint: "#8f8f8f"
  graphite: "#262626"
  near-black: "#121212"
  up: "#2f8f4e"
  up-tint: "#eaf6ee"
  degraded: "#a86a0e"
  degraded-tint: "#fdf0dd"
  down: "#e4312b"
  down-tint: "#fdecea"
  maint: "#4a70a8"
  maint-tint: "#e9eff7"
  neutral: "#8f8f8f"
  neutral-tint: "#ededed"
typography:
  display:
    fontFamily: "'Barlow Semi Condensed', sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Barlow Semi Condensed', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Barlow Semi Condensed', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Barlow', -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Barlow', -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "36px"
components:
  button-primary:
    backgroundColor: "{colors.surface-51-red}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "8px 18px"
  button-primary-hover:
    backgroundColor: "{colors.red-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "8px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "8px 18px"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "8px 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.gray-mute}"
    rounded: "{rounded.full}"
    padding: "8px 18px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.down}"
    rounded: "{rounded.full}"
    padding: "8px 18px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  chip-active:
    backgroundColor: "{colors.surface-51-red}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  badge:
    backgroundColor: "{colors.paper-sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "5px 12px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  input-focus:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Site Uptime Checker

## Overview

**Creative North Star: "The Pit Wall"**

This is a monitoring dashboard built like a motorsport timing screen: monochrome
at rest, dense with numbers, and readable at a glance while something is going
wrong. The surface is pure black-and-white with a graphite mid-scale; the only
chromatic voice is a single warm **Surface 51 Red** (`#e4312b`), and it is spent
carefully — on the one primary action, the active nav item, the focus ring, the
S51 mark, and genuine `down`/`error` state. Everything else earns its place
through typography, hairline rule, and tonal surface steps.

The typographic pairing is industrial and sturdy: **Barlow Semi Condensed** for
every heading and numeric readout — compressed, semi-bold, tracked tight so a row
of stats reads like a signage panel — over plain **Barlow** for body copy and
form text. Nothing is decorative. Corners are either a full pill (every
interactive control) or a calm container radius (8 / 12 / 20px); there is no soft
in-between. Motion is 100ms feedback on `ease-snappy`, never an entrance.

Depth is almost flat. Cards and panels sit on the page with a 1px hairline border
and no shadow; they signal interactivity by promoting that border to solid
black (or white in dark mode) on hover, not by lifting. The one exception is
transient floating layers — the command palette, dropdown menus, toasts — which
carry a single soft shadow so they read as detached from the page beneath.

The persistent chrome (the 236px left rail at desktop, the compact top bar
below it) is pure `#000` in **both** themes by deliberate design, and uses
literal colors rather than the semantic tokens that flip with `[data-theme]`.

**Key Characteristics:**
- Monochrome base, one signal-red accent used sparingly (~one prominent moment per screen)
- Barlow Semi Condensed for all headings + numbers; Barlow for body
- Full-pill interactive controls; 8/12/20px radius for containers
- Flat by default — hairline borders and tonal surfaces, shadow only on floating layers
- Snappy 100ms `ease-snappy` transitions as feedback, not decoration
- Always-black sidebar/top bar in both light and dark themes
- Five semantic status families (up / degraded / down / maintenance / neutral), each with a `-tint` pair

## Colors

A high-contrast monochrome system: black text on white paper, a graphite
mid-scale for secondary information, and exactly one accent hue. Dark mode
remaps only the semantic layer — the raw `red-*` and `gray-*` scales never
change, and the accent hue is constant across themes.

### Primary
- **Surface 51 Red** (`#e4312b`): The single accent. Carries the primary button,
  the active nav pill, the `:focus-visible` ring, `::selection`, the S51 badge
  outline, and the unread-count dot — plus it doubles as the `down`/`error`
  status color. Hover deepens to **Red Deep** (`#c92620`), active to **Red
  Deepest** (`#a31e19`). **Red Tint** (`#fdecea`) backs error banners and the
  `down` badge fill.

### Neutral
- **Ink** (`#000000`): Primary text, `border-strong` (hover borders, secondary
  button outline), and the inverse surface (buttons, active tabs, sidebar).
- **Paper** (`#ffffff`): Page and raised-card background in light mode.
- **Paper Sunken** (`#f7f7f7`): Recessed areas — image wells, `neutral` badge
  fill, table zebra.
- **Hairline** (`#dcdcdc`): The default 1px border on every card, input, panel,
  and divider.
- **Gray Mute** (`#5c5c5c`): Secondary text — labels, subtitles, ghost-button text.
- **Gray Faint** (`#8f8f8f`): Tertiary text — captions, hostnames, empty-state copy, the `neutral` status dot.
- **Graphite** (`#262626`) / **Near Black** (`#121212`): Dark-mode border and
  sunken-surface values; the dark theme's raised surface is `#0a0a0a` on a `#000` page.

### Status (semantic, five families)
Each family is a solid color for dots, icons, and text, plus a low-chroma
`-tint` for fills. Values shift per theme for contrast; the roles do not.
- **Up** (`#2f8f4e`, tint `#eaf6ee`): Healthy checks, ≥90 Lighthouse.
- **Degraded** (`#a86a0e`, tint `#fdf0dd`): Slow responses, 50–89 Lighthouse,
  near-expiry SSL. Darkened from the source mock's `#c07a12` for AA text on white.
- **Down** (`#e4312b`, tint `#fdecea`): Failed checks, open incidents, `<50` Lighthouse. Shares the accent hue.
- **Maintenance** (`#4a70a8`, tint `#e9eff7`): Informational — suppressed alerts, active maintenance windows.
- **Neutral** (`#8f8f8f`, tint `#ededed`): Unknown / no-data / paused monitors.

### Named Rules
**The One Voice Rule.** Surface 51 Red appears on ~10% of a screen at most —
one primary action, the active nav item, a focus ring, and any true `down`
state. It is never a background wash, a large fill, a decorative divider, or a
brand skin. Its rarity is what makes it mean "look here."

**The Constant Hue Rule.** Dark mode overrides the semantic layer only. The
`red-*` and `gray-*` primitive scales and the accent hue are identical in both
themes; only surface, border, and text roles are remapped.

**The Black Chrome Rule.** The sidebar and mobile top bar are `#000` in both
themes and are styled with literal colors (`bg-black`, `text-white`,
`border-white/15`), never the flipping surface tokens.

## Typography

**Display Font:** Barlow Semi Condensed (fallback: `sans-serif`) — weights 600 / 700 / 800
**Body Font:** Barlow (fallback: `-apple-system, sans-serif`) — weights 400 / 500 / 600 / 700
**Mono Font:** `ui-monospace, 'SF Mono', Menlo, monospace` — keyboard hints, code, log excerpts
**Icons:** Material Symbols Outlined (`opsz 20, wght 400, FILL 0, GRAD 0`), loaded `display=block`

**Character:** Industrial and sturdy. The condensed display face packs headings
and big numbers into a tight, signage-like block; the plain body face keeps
running text neutral and legible underneath. No serifs, no second display face,
no flourish.

### Hierarchy
- **Display** (700, `3rem` / `text-4xl`, line-height 1, tracking `-0.02em`): Page
  `<h1>` titles and the large stat numbers in `StatBlock`. A `4rem` / `text-5xl`
  step exists for oversized readouts.
- **Headline** (600, `1.25rem` / `text-xl`, tracking `-0.02em`): `SectionHeading`
  — the label above a card or region.
- **Title** (600, `1.125rem` / `text-lg`, tracking `-0.02em`): Card titles
  (`SiteCard` `<h3>`), dialog titles.
- **Body** (400, `1rem` / `text-base`, line-height 1.5): Paragraphs, form values,
  table cells. Secondary/tertiary copy drops to `text-sm` / `text-xs` in Gray
  Mute / Gray Faint.
- **Label** (600, `0.75rem` / `text-xs`, tracking `0.08em`, UPPERCASE): Badge
  text, filter headers ("FILTER"), the sidebar wordmark kicker.

### Named Rules
**The Readout Rule.** Anything numeric that a user scans under pressure —
uptime %, response ms, counts, Lighthouse scores — is set in Barlow Semi
Condensed, not the body face. Numbers are display type here.

**The Two Tracking Rule.** Headings and readouts use tight tracking
(`-0.02em`); uppercase labels use wide tracking (`0.08em`). Body text stays at
normal. There is no other letter-spacing.

## Layout

**App shell.** A two-part frame: a `sticky`, full-height **236px** black rail on
the left at `lg` and up (logo lockup, nav, quick-jump button, theme toggle,
site/tag footnote); below `lg` it collapses to a `sticky` black top bar with the
same destinations and no drawer state. Main content is `min-w-0 flex-1` with
`px-6 py-8` padding, rising to `px-12 py-12` at `lg`, and an inner
**`max-width: 1160px`** centered column.

**Page rhythm.** Every page is a single vertical `flex flex-col` stack with
`gap-9` (36px) between major regions. Pages open with a header row: `<h1>`
(Display) plus a one-line subtitle on the left, a wrapping cluster of action
buttons pushed right.

**Grids.** Card fleets use
`grid-cols-[repeat(auto-fill,minmax(300px,1fr))]` (single column on mobile).
Paired charts/panels use `lg:grid-cols-2`. Stat rows use a
`grid-cols-2 → sm:grid-cols-3 → lg:grid-cols-5` progression. Dense records fall
back to a full table (`SitesTable`).

**Spacing scale.** Tailwind's default 4px scale, used at a few consistent steps:
`xs` 4px, `sm` 8px, `md` 16px, `lg` 24px (card padding `p-6`, grid gaps `gap-6`),
`xl` 36px (page-region stack `gap-9`).

**Density.** Comfortable, not cramped: 24px card padding, 24px grid gutters,
generous 36px between regions — but information-dense within each card (screenshot
+ status + two metrics + sparkline + history bar in one `SiteCard`).

**Breakpoints.** Tailwind defaults; the load-bearing one is `lg` (1024px), where
the rail replaces the top bar and page padding doubles.

## Elevation & Depth

Flat by default. Resting surfaces — cards, panels, the summary bar, inputs — have
**no shadow**. They separate from the page with a 1px Hairline border and a tonal
step between `surface-page`, `surface-raised`, and `surface-sunken`. A card
signals it is a link target by promoting its border to `border-strong` (solid
black, or white in dark mode) on hover; it does not lift, scale, or gain a shadow.

The single exception is **transient floating layers** — the command palette,
dropdown action menus, toasts, the Lighthouse progress panel. These get one soft
shadow so they read as detached from whatever is behind them.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.28)`): Modal-style
  floating panels — the command palette, dialogs.
- **Menu** (`box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.18)`): Smaller detached
  surfaces — dropdown menus, popovers, toasts.

### Named Rules
**The Flat-Bed Rule.** If it is part of the page, it is flat with a border. If
it floats above the page (overlay, menu, toast), it gets exactly one shadow from
the vocabulary above — never both a heavy border and a shadow.

**The Border Promotion Rule.** Hover and active states on surfaces are expressed
by moving the border from Hairline to `border-strong`, or by swapping fill to the
inverse surface — not by shadow, translate, or scale. (Buttons may `active:scale-[0.97]` as touch feedback only.)

## Shapes

Two corner languages, nothing between them:

- **Full pill** (`border-radius: 9999px`) for every interactive control:
  buttons, chips, badges, the segmented control, tab nav, sidebar nav items, the
  quick-jump button, the S51 badge, count dots. Pills are the signature.
- **Container radius** for everything that holds content: **8px** (`sm` — menus,
  small popovers), **12px** (`md` — inputs, selects, dropdown menus), **20px**
  (`lg` — cards, panels, empty states, banners). The command palette uses a
  slightly larger `rounded-xl` (12px+).

**Borders.** 1px Hairline is the default everywhere. Buttons and the secondary
outline use a heavier **2px** border. Dashed 1px Hairline marks a placeholder or
"nothing here yet" state (empty states, the add-site affordance).

**Silhouette.** Rectangular cards with generous radius; circular status dots
(`h-2 w-2`) as the recurring small mark; the S51 logo is a stroked circular
outline.

## Components

### Buttons
- **Shape:** Full pill (`9999px`), 2px border, Display font, `font-semibold`.
  Sizes: `sm` (default, `8px 18px`, `text-sm`) and `md` (`12px 24px`, `text-base`).
  Icon (Material Symbol) sits after the label with an 8px gap.
- **Primary:** Surface 51 Red fill, white text, red border → hover Red Deep fill + border.
- **Secondary:** Transparent fill, Ink text, 2px Ink border → hover inverts to Ink fill + white text.
- **Ghost:** Transparent, Gray Mute text, transparent border → hover `surface-sunken` fill + primary text.
- **Danger:** Transparent, Down text, Down border → hover Down fill + white text.
- **All states:** `transition-all 100ms ease-snappy`; `active:scale-[0.97]`;
  disabled is `opacity-50` + `cursor-not-allowed` with hover suppressed.

### Chips
- **Shape:** Full pill, 1px border, `font-medium`. Sizes `sm` (`4px 10px`,
  `text-xs`) and `md` (`8px 16px`, `text-sm`).
- **Unselected:** Transparent fill, Ink text, Hairline border → hover `surface-sunken` fill.
- **Selected/active:** Surface 51 Red fill, white text, red border.
- **Use:** Tag filters and sort toggles on the dashboard; multi-select (match ANY).

### Badges
- **StatBadge (`UiBadge`):** Full pill, `5px 12px`, uppercase Label type. Tones:
  `neutral` (sunken fill), `outline` (transparent + Ink border), `accent` (red
  fill), and the four status tones (`up` / `degraded` / `down` / `maint`) as
  `-tint` fill + solid-color text, no border.
- **StatusBadge (signature):** Not a pill — a colored dot (`h-2 w-2` `sm`,
  `h-2.5 w-2.5` `md`) plus `font-medium` label in the status color. Covers the
  five check/site states: Up, Degraded, Down, No data, Paused, Maintenance. This
  dot+label pair is the canonical way to show state anywhere in the app.

### Cards / Containers
- **Corner:** 20px (`lg`).
- **Background:** `surface-raised` (white / `#0a0a0a`).
- **Border:** 1px Hairline; `dashed` variant for placeholders.
- **Shadow:** None (see Elevation).
- **Padding:** 24px default (`p-6`); overridable (e.g. `px-8 py-7` on the summary
  bar); `flush` drops padding so tables/lists bleed to the border.

### Inputs / Fields
- **Style:** `surface-raised` fill, 1px Hairline border, 12px radius, `12px 16px`
  padding, `text-base`. Label above in `text-sm` Gray Mute; optional error line
  below in `text-xs` red.
- **Focus:** Border shifts to `border-strong` (`focus:border-border-strong`); the
  global `:focus-visible` ring is `2px solid` Surface 51 Red at `2px` offset.
- **Error:** Border becomes Surface 51 Red.
- **Select:** Same box as Input, with `cursor-pointer`.

### Navigation
- **Sidebar (lg+):** Black rail, 236px. Nav items are full pills, `text-sm`
  `font-medium`, Gray-300 text → hover `bg-white/10` + white. Active item is a
  **solid Surface 51 Red pill** with white semibold text. Unread notifications
  show as a small red count pill on the right.
- **Top bar (< lg):** Same black background and pill treatment, condensed to
  icons + count dots.
- **TabNav / SegmentedControl:** A pill-shaped track (1px Hairline border, `p-1`)
  holding smaller pills; the active tab/segment is a solid `inverse` (black/white)
  pill with `on-inverse` text, inactive is Gray Mute → hover `surface-sunken`.
  `TabNav` items are real `<NuxtLink>` routes; `SegmentedControl` is a bound value.

### SiteCard (signature)
A link card: a `16:9` screenshot well (falls back to a centered `public` icon on
a sunken field) above a `p-6` body — title + `StatusBadge` row, hostname + a
Lighthouse score chip, optional maintenance badge, inline tag editor, an
uptime/response metric pair, a `Sparkline` + conditional SSL-expiry badge, and a
full-width `UptimeBar` history strip. Hover promotes the border to
`border-strong` and reveals a top-right row of pill action buttons (Check now /
Pause / Remove) that stop propagation.

### S51 Mark
Two forms: a compact **badge** — a `38px` circle with a 2px Surface 51 Red
border and red extra-bold "S51" in Display type, beside a two-line wordmark
("Site Uptime" / "SURFACE 51" kicker); and the full **logo**, a stroked
(`fill: none; stroke: currentColor`) circular SVG that draws itself in via
anime.js on the first-visit `AppSplash` overlay.

## Do's and Don'ts

### Do:
- **Do** build every interactive control as a full pill (`9999px`) — buttons,
  chips, badges, segmented controls, tab nav, nav items, count dots.
- **Do** use the 8 / 12 / 20px container radius for anything that holds content,
  and nothing between pill and those steps.
- **Do** convey depth with a 1px Hairline border and tonal surface steps
  (`page` → `raised` → `sunken`); promote the border to `border-strong` on hover
  instead of adding a shadow.
- **Do** reserve shadow for transient floating layers (command palette, menus,
  toasts) using the Overlay / Menu vocabulary — one shadow, no heavy border.
- **Do** show every up / degraded / down / paused / maintenance state with the
  `StatusBadge` dot + label pattern and the five semantic status colors.
- **Do** set headings and any scanned number in Barlow Semi Condensed with
  `-0.02em` tracking; set uppercase labels in Barlow with `0.08em` tracking.
- **Do** keep transitions at ~100ms on `ease-snappy`
  (`cubic-bezier(0.22, 0.61, 0.36, 1)`) — motion is feedback, not an entrance.
- **Do** keep the sidebar and top bar `#000` in both themes, styled with literal
  colors, not the flipping surface tokens.
- **Do** limit Surface 51 Red to ~one prominent moment per screen (primary
  action, active nav, focus ring, S51 mark) plus genuine `down`/`error` state.

### Don't:
- **Don't** use the red as a large fill, background wash, gradient, or
  decorative divider — it is a signal, not a brand skin.
- **Don't** put a drop shadow on a resting surface (card, panel, summary bar,
  input).
- **Don't** introduce a second display typeface, a serif, or any letter-spacing
  outside the tight/normal/wide trio.
- **Don't** invent a status color outside the five families
  (`up` / `degraded` / `down` / `maint` / `neutral`) and their `-tint` pairs.
- **Don't** let dark mode alter the raw `red-*` / `gray-*` scales or the accent
  hue — only the semantic surface/border/text roles remap.
- **Don't** exceed the `1160px` content column or drop the 236px rail at desktop.
- **Don't** signal hover/active with translate, scale, or shadow on surfaces —
  use border promotion or an inverse-fill swap (buttons' `active:scale-[0.97]`
  touch feedback is the only exception).
