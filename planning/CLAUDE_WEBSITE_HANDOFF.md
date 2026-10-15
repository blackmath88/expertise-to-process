# Claude handoff: updated website pitch
Status: approved direction for a website update; implementation still to do.
Repository: blackmath88/expertise-to-process
Concept authority: CONCEPT.md
Discussion in English; website copy in German, Swiss spelling.

## Outcome
Update the existing landing page and relevant app introductions so visitors understand the organisational journey, immediate personal value, local autonomy, process variants and the longer-term technical vision. Deliver the implemented website changes, not just a copy proposal.

## Orientation and scope
Fetch current main, inspect instructions and current work before editing. Follow any applicable repository/Weavr contract. Work on an isolated branch and preserve concurrent changes. This handoff authorises the website implementation described here, not mission dispatch, new services, deployment configuration or automatic merge.
Primary files: docs/index.html, docs/landing/landing.css, docs/landing/landing.js, docs/landing/demo-institution.json; relevant explanatory copy in docs/app/index.html. Update README or browser checks where necessary.
Retain the quiet typographic design, responsive layout, accessibility, relative paths and existing functional app.

## Narrative and hierarchy
1. Keep the headline “Was Einzelne wissen, soll die Institution können.”
2. Make “Gemeinsam verstehen. Eigenständig gestalten.” the guiding principle.
3. Explain the immediate result: an understandable process map, useful questions and knowledge colleagues can reuse.
4. Present three organisational phases prominently:
   - Entdecken und verstehen: process learning, shared language, scope and inventory of existing processes/tools/documentation.
   - Teilen und verbinden: curated library, common ground, local differences, responsible teams.
   - Gezielt verbessern: suitable tools, reuse, tested simplification, shared services and selective standardisation where justified.
5. Present the technical development as a separate, linked track: guided/AI-assisted capture; AI-supported knowledge base; context-aware improvement assistance.
6. Distinguish “Heute in der Demo”, “Nächster Pilot” and “Zielbild”. Organisational progress does not depend on deploying AI first.

Suggested lead:
“Pietro hilft Menschen und Teams, ihre Arbeitsweisen verständlich zu machen. Zuerst entdecken wir vorhandene Expertise und entwickeln eine gemeinsame Prozesssprache. Daraus wächst eine Bibliothek verwandter Abläufe – mit lokalen Varianten und klarer Verantwortung. Gemeinsam erkennen wir, welche Verbesserungen und Werkzeuge im jeweiligen Kontext helfen.”

## Process families demonstration
Add a compact, clearly labelled fictional vision example, preferably within the institutional demo:
- An event-announcement process and two related local variants.
- Each has a responsible team, scope, version, parent version and a specific reason for adaptation.
- One variant adds room approval, another translation review.
- Show shared steps and justified differences; a shared improvement is a proposal requiring local acceptance.
- Use “Für unser Team anpassen”, “Unterschiede verstehen”, “Verbesserung vorschlagen”, “Änderung geprüft übernehmen”.
- This is a vision illustration, not a working repository collaboration system. Any interactive controls should actually switch explanatory views and must not pretend to submit or merge.
- Explain that variants retain independent responsibility; updates and approval status are never automatically inherited.
Do not change production schemas or implement backend versioning as part of this website slice.

## Pilot / feasibility
Use the bounded proposal in CONCEPT.md: twelve weeks, three voluntary teams, selected processes, existing-material discovery first. Show intended responsibilities and evaluation: can another person understand and reuse a description; clarification/search effort versus capture/review/maintenance effort.
No invented approved budget, cost centre, savings, organisational mandate or live AI integration. Existing resources are a funding option to examine. Distinguish time capacity from cash savings.

## Evidence and copy
Keep useful theory but prioritise a few traceable sources for the mechanisms. Verify original sources before adding factual claims; distinguish theory, empirical evidence, practical precedents and untested product effects.
Research leads:
- Subramani et al. (2021), DOI 10.25300/MISQ/2021/15635: longitudinal repository use and technical-support calls; not a university trial.
- White & Cicmil (2016), DOI 10.1108/IJPPM-01-2014-0007: process mapping and knowledge acquisition.
- HSLU quality-management documentation: staff-accessible process portal; precedent, not evidence of Pietro savings.
Replace unsupported “am wirksamsten” with qualified wording. Replace “für alle” with context-appropriate sharing language. Do not claim all tacit expertise can be captured.
Keep fictional demonstration data clearly labelled.

## Acceptance
- Landing page explains both tracks and the relation between them without conflating maturity with implemented functionality.
- Local differences and selective, separately decided standardisation are coherent throughout.
- Fictional process-family example visibly explains ownership, lineage and adaptation.
- Existing app routes, examples and contribution export continue to work.
- Run npm run validate:library, npm test, npm run test:browser; inspect rendered desktop and 390px mobile screenshots, including new content.
- No overflow, broken links, inaccessible controls or unexplained mock actions.
- Provide a reviewable PR and concise summary of changes, checks, limitations and screenshots. Do not merge automatically.

## Separate known application findings
The previous review reproduced array-position-based false loop detection in docs/app/lib/review.js, and “no decision” being stored as “no exceptions” in guidance.js. Expertise prompts also need deeper elicitation. These are separate application follow-ups, not requirements to expand this website slice.
