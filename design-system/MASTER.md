# Design system · Pietro × Universität Musterstadt

Source of truth for the landing page (`docs/index.html`) and the app (`docs/app/`).
Inputs: the UI UX Pro Max skill (Swiss Modernism 2.0 recommendation: rational grid, rules,
clear hierarchy; "never convey status by colour alone"; SVG icons, no emoji). Taken as
inputs: its Google-Fonts suggestion is rejected (no external font requests), its navy/blue
palette is narrowed to graphite + cobalt.

## 1 · Brand architecture

| Role | Owns | Never owns |
| --- | --- | --- |
| **Pietro** — the product | App chrome: header, navigation, buttons, forms, tabs, the personal draft, the process check, proposals | Institutional records, institutional status |
| **Universität Musterstadt** — fictional example institution | The example workspace and its content: library records, process families, demo data | Navigation or controls |
| **Status** — semantic, brand-neutral | Maturity (Heute / Pilot / Zielbild), review state, errors | Decoration |

The relationship is always written out: **Pietro / Beispielraum Universität Musterstadt**.
Every Musterstadt surface carries «Fiktive Beispieluniversität».

- *Personal draft* (Pietro styling, cobalt rule, label «Persönlicher Entwurf · nur in diesem Browser»).
- *Institutional record* (Musterstadt document styling, burgundy rule, record header with ID, label «Fiktiver Bibliothekseintrag»).
- Copying a record into a draft switches styling: the copy is Pietro, its origin is cited as a Musterstadt reference.

On the landing page, Musterstadt only appears **inside bounded demonstration frames**
(`.demo-frame`) that start with the institutional masthead. The page itself is Pietro.

## 2 · Colour tokens

Product (Pietro)

| Token | Value | Use | Contrast on white |
| --- | --- | --- | --- |
| `--ink` | `#15181d` | headings, primary text | 17.8 : 1 |
| `--ink-2` | `#3a4049` | body text | 10.5 : 1 |
| `--muted` | `#5d6470` | secondary text, captions | 6.0 : 1 |
| `--line` | `#e3e5e9` | hairline rules | — |
| `--line-strong` | `#c8ccd3` | control borders | — |
| `--canvas` | `#f5f6f8` | app background, neutral fill | — |
| `--surface` | `#ffffff` | panels, inputs | — |
| `--cobalt` | `#2347c5` | primary action, links, focus, active nav | 7.6 : 1 |
| `--cobalt-hover` | `#1b399f` | hover/pressed | 9.8 : 1 |
| `--cobalt-soft` | `#eef2fd` | selected row, draft rule background | — |

Institution (Universität Musterstadt)

| Token | Value | Use | Contrast on white |
| --- | --- | --- | --- |
| `--um-burgundy` | `#7b1e34` | mark, masthead rule, record labels | 10.1 : 1 |
| `--um-burgundy-deep` | `#5c1426` | wordmark | 13.3 : 1 |
| `--um-burgundy-soft` | `#f8eef0` | masthead band, record header | — |
| `--um-rule` | `#dcc8cd` | record borders | — |
| `--um-stone` | `#4a4e55` | record body text | 8.4 : 1 |

Status (semantic; always paired with an icon shape and a word; text on its tint 5.8–7.4 : 1)

| Token pair | Meaning | Shape |
| --- | --- | --- |
| `--st-now` `#0b6b45` / `--st-now-bg` `#e7f4ed` | Heute in der Demo · fachlich geprüft | filled dot |
| `--st-pilot` `#875200` / `--st-pilot-bg` `#fbf1de` | Nächster Pilot · Prüfung ausstehend | half dot |
| `--st-vision` `#4b3c9e` / `--st-vision-bg` `#efedf9` | Zielbild | ring |
| `--st-neutral` `#5d6470` / `--canvas` | nicht geprüft · keine Vorgabe | dash |
| `--st-danger` `#b42318` / `#fdeceb` | Fehler, Rückweg in der Karte | triangle |

Rules: brand colours never signal status; status colours never decorate. No gradients,
no glass, no beige or green washes.

## 3 · Typography

One sans-serif stack, no downloads:
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
Monospace for IDs and versions: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.

| Step | Size / line | Weight | Use |
| --- | --- | --- | --- |
| display | clamp(40px, 6vw, 72px) / 1.02 | 700, -0.035em | landing hero only |
| h1 | clamp(28px, 3.4vw, 40px) / 1.1 | 700, -0.025em | page/view title |
| h2 | clamp(22px, 2.4vw, 30px) / 1.15 | 650, -0.02em | section title |
| h3 | 17px / 1.3 | 650 | component title |
| body | 16px / 1.55 (app panels 15px) | 400 | text |
| small | 13px / 1.45 | 400–500 | captions, meta |
| label | 12px / 1.3, +0.04em, uppercase | 600 | section labels, table heads |

Numbers in tables and counters use `font-variant-numeric: tabular-nums`.

## 4 · Space, grid, borders

- 4 px base: `--s1` 4 · `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 24 · `--s6` 32 · `--s7` 48 · `--s8` 64 · `--s9` 96.
- Landing: 12-column grid, max 1200 px. Editorial sections use a **label column (3/12)** and a
  **content column (9/12)** separated by a top rule. Below 900 px they stack.
- App: workbench columns `capture 340px · map 1fr · insights 280px`; two columns below 1180 px; one below 820 px.
- Borders: 1 px hairlines carry structure. Radius: controls 6 px, panels 8 px, institutional
  records 2 px (squarer = documentary). No radius above 10 px.
- Shadows: only for overlays (dialog, toast) and the hero product frame.

## 5 · Components

Pietro: `app-bar` (white, bottom rule, Pietro mark, underline nav), `workspace-bar`
(breadcrumb «Pietro / Beispielraum Universität Musterstadt» + fictional tag), buttons
(`primary` cobalt filled, `secondary` outline, `ghost` text), underline `tabs`, `segmented`
(only for binary modes), inputs with visible labels, `proposal` (cobalt left rule), `finding`
list rows with type icon, `map-frame`, `toast`, `dialog`.

Musterstadt: `um-masthead` (UM mark, wordmark, «Fiktive Beispieluniversität», burgundy top rule),
`um-record` (document sheet: record header with ID in mono, metadata table, sections divided by
rules), `um-lineage` (version tree), record list rows (`lib-record`) instead of card grids.

Status: `.status` = icon shape + word on a tinted chip, never colour alone.

Cards are reserved for discrete objects (a record, a version, a proposal). Lists and editorial
sections use rules, not cards.

## 6 · Icons

Inline SVG sprite `docs/assets/icons.svg`, 24 × 24 grid, 1.75 px stroke, round caps,
`currentColor`. Icons accompany labels; icon-only buttons need `aria-label`. No emoji.

## 7 · Product versus institution — examples

| Element | Pietro | Universität Musterstadt |
| --- | --- | --- |
| Heading | Graphite, sans, tight tracking | Burgundy label + graphite title, record ID in mono |
| Container | White panel, 8 px radius, hairline | White sheet, 2 px radius, burgundy top rule |
| Label | «Persönlicher Entwurf» | «Fiktiver Bibliothekseintrag · Kommunikation» |
| Action | «Als eigenen Entwurf verwenden» (cobalt button) | — (records have no controls of their own) |

Specimen: `design-system/specimen.html` (open locally; uses the same CSS tokens).

## 8 · Accessibility checks

Text ≥ 4.5 : 1 (all tokens above), focus ring 2 px cobalt with 2 px offset on every interactive
element, targets ≥ 40 px high for primary controls, reflow to 320 px without page-level
horizontal scrolling, `prefers-reduced-motion` respected.
