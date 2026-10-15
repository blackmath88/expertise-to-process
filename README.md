# expertise-to-process · Pietro

**Was Einzelne wissen, soll die Institution können.**
*Expertise verbinden. Gemeinsam besser arbeiten.*

Pietro is a small, dependency-free web app that helps non-specialists learn a shared process language, describe their own work as a process, get deterministic sparring feedback, compare it with related examples from a process library, and prepare a reviewed contribution.

**Gemeinsam verstehen. Eigenständig gestalten.** Pietro makes local processes understandable and discussable across teams. A shared process language connects individual expertise while preserving context, local responsibility and meaningful differences. Library examples are adaptable references; publishing or reviewing one does not make it a mandatory standard. Any later harmonisation requires a separate decision by the responsible people.

The demo is set at the **fictional Universität Musterstadt**. All processes, roles and library entries are invented. User interface in German (Swiss spelling).

→ Concept (German): [CONCEPT.md](CONCEPT.md)
→ Website update handoff: [planning/CLAUDE_WEBSITE_HANDOFF.md](planning/CLAUDE_WEBSITE_HANDOFF.md)

## Development vision

The organisational journey is **discover and understand → share and connect → improve deliberately**. Teams learn a shared language, discover existing expertise, build a library of contextual variants and then evaluate tools, shared services or agreed standards where useful.

The technical journey is **guided capture → AI-assisted process knowledge base → assistance tailored to the institution’s actual tools and services**. AI proposes; people validate and decide. Process families should retain explicit parent-version links, local ownership and adaptation rationale, independently of Git storage.

Process lineage, cross-variant change proposals and AI library orchestration are planned capabilities, not features of the current demo. See the concept for phase outcomes, pilot evaluation and operating assumptions.

## Try it

After GitHub Pages is enabled:
- **Landing page** – story, how it works, scientific background, and a dummy-data demo for an individual and for the university: `https://blackmath88.github.io/expertise-to-process/`
- **App**: `https://blackmath88.github.io/expertise-to-process/app/`

The landing page is built around the three organisational phases (*Entdecken – Wissen sichtbar machen → Teilen – Voneinander lernen → Institutionalisieren – Verbesserungen im Alltag verankern*), follows one fictional example («Veranstaltung ankündigen») through all three, and shows four illustrative first simplifications with existing tools (*Prozess verstanden. Ersten Schritt vereinfacht.*) – proposals, not integrations. It keeps the subordinate technical track toward an AI-supported process knowledge base, and labels every capability as **Heute in der Demo**, **Nächster Pilot** (proposal) or **Zielbild**. Its *Prozessfamilien* demo tab is a fictional illustration of variants with responsible teams, version lineage and reasons for differences; its buttons only switch explanations – the app has no versioning, proposals or merging yet.

The landing demo's *Für Einzelne* view runs the app's own map and process-check modules on the prepared example. The *Für die Universität* view only counts what is in `docs/landing/demo-institution.json` (12 invented process descriptions, 5 invented units); it shows no time, cost or performance figures.

Locally (Node.js ≥ 22, no API key):

```sh
npm start        # http://localhost:3000/app/
```

Suggested 5-minute tour:
1. **Beispiel ausprobieren** – a prepared, clearly labelled script builds an expense-claim process. Accept, edit or reject each proposal; undo any step.
2. **Prozess-Check** – facts, open questions and hypotheses, each linked to the step it refers to.
3. **Vergleich** – tag the process; related library entries share the *completeness check* pattern.
4. **Prozessbibliothek** – compare *onboarding* with *research funding*: same pattern, different local rules.
5. **Mitnehmen / Beitragen** – preview and download a contribution marked *pending review*.

## What it does

| Area | Behaviour |
| --- | --- |
| Lernen | Seven exercises (trigger, activity, decision, role, handover, outcome, exception), university or pizzeria examples, an explanation for every answer. |
| Mein Prozess | Guided one-question-at-a-time capture or direct editing; proposals are previewed, then accepted/edited/rejected; undo; SVG map plus text alternative; completeness checklist (no score). |
| Prozess-Check | Rule-based, no LLM. Separates facts, open questions and hypotheses; cites step IDs; never invents savings or compliance verdicts. Markdown report. |
| Vergleich | Deterministic tag matching against the library, with keyword-rule tag suggestions shown as evidence-backed proposals. |
| Prozessbibliothek | Versioned JSON files; search, filters, empty/error states; review, effectiveness and authority shown separately; copy an example into your draft (protected, undoable). |
| Beitragen | Separate redactable copy, exact JSON preview, explicit confirmation, download of a `pending-review` envelope + Markdown. No network write; tokens, settings and chat are never exported. |
| Optional | Live text chat through a separately hosted Mistral proxy (`server/`). Replies never modify the draft. Off by default. |

Not included: speech input, structured AI proposals, a central database, formal BPMN 2.0.

## Architecture

Static HTML/CSS/vanilla ES modules served from `docs/` (GitHub Pages). No build step, no CDN, no external fonts.

Visual design: two identities, Pietro (product chrome, cobalt) and the fictional Universität Musterstadt (example content, burgundy). Tokens, components and rules are in [`design-system/MASTER.md`](design-system/MASTER.md); open `design-system/specimen.html` through a local server to see both side by side.

```
docs/index.html        landing page (docs/landing/: styles, script, dummy institution data)
docs/assets/           shared tokens/components (base.css) and SVG sprite (icons.svg)
docs/app/
  index.html  style.css  app.js  model.js     v1 process model
  lib/storage.js       read-only static library + explicit browser draft storage
  lib/library.js       validation, search, comparison, keyword suggestions
  lib/review.js        deterministic process check + report
  lib/guidance.js      guided questions, prepared script, proposal preview/apply, undo
  lib/ai.js            offline AI adapter boundary (same proposal contract for a future model)
  lib/contribution.js  contribution copy and envelope; download only
  lib/map.js lib/dom.js lib/lessons.js
  data/                library-index.json, taxonomy.json, processes/*.json, patterns/*.json
schemas/               JSON Schema documentation of library entries and contributions
scripts/validate-library.mjs   dependency-free validator (runs in CI)
server/index.js        optional Mistral proxy + static server for local use
tests/                 unit tests and a Playwright end-to-end test
```

All data is loaded through relative URLs, so the app runs below any Pages repository prefix. All user and library text is rendered as text, never as markup.

## Develop and test

```sh
npm ci
npm run validate:library   # library data, references, graphs, sizes
npm test                   # unit tests
npx playwright install chromium
npm run test:browser       # end-to-end journey, failure cases, keyboard, 390 px, repository prefix
```

`PW_CHROMIUM_PATH=/path/to/chrome` uses an existing Chromium. Screenshots land in `test-results/`.

### Adding a library entry

1. Take a contribution file (`beitrag-….json`) and have the involved roles review it.
2. Copy `candidateEntry` to `docs/app/data/processes/<id>.json`; set classification, relations and maintenance; set `review` only for a review that happened. Effectiveness and authority need their own evidence.
3. Add `{id, kind, path}` to `docs/app/data/library-index.json`, run `npm run validate:library`, open a PR.

Only fictional or explicitly publication-approved content belongs in this public repository.

## Deploy on GitHub Pages

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push to `main` (or run *Publish process lab* manually). Only `docs/` is published; the server and any secrets never are.

## Optional live chat

GitHub Pages cannot run the backend. Run `server/index.js` on an approved host with `MISTRAL_API_KEY`, `LAB_ACCESS_TOKEN` and `ALLOWED_ORIGIN` (exact frontend origin) from that host's secret store; optionally `MISTRAL_MODEL`, `HOST`, `PORT`. Enter the endpoint and lab token in the app's settings; they stay in page memory only. The proxy enforces token auth, exact origin, schema and size checks, a fixed upstream, timeouts and simple rate limits. Tests use a mock provider only.

---

Concept prototype by Achim Imboden. Universität Musterstadt is fictional; any resemblance to real institutions is unintended.
