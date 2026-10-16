# Contributing

Start with a reproducible problem or a concrete improvement for someone using the project. Small, focused changes are easiest to review.

## Competition freeze

The deployed demo, application code and dataset remain frozen. Documentation corrections outside the deployed application can be proposed for review, as authorised by the owner on 16 October 2026. This does not lift the deployment freeze. Do not change workflows, Pages settings, snapshot branches or deployed assets as part of presentation work. See [AGENTS.md](AGENTS.md).

## Report a problem

Use the [issue form](https://github.com/blackmath88/expertise-to-process/issues/new?template=problem.yml). Include the page or command, expected behaviour, what happened, and the revision or environment when known. For a data or evidence concern, include the source record and explain the uncertainty. Remove personal information and credentials from logs and screenshots.

For a larger feature, open an issue describing the user need before implementation. A proposal is not an approved change of scope.

## Verify a change

Use Node.js 22+. Run `npm run validate:library` and `npm test`. For browser checks, run `npm ci`, `npx playwright install chromium`, then `npm run test:browser`.

Run `python3 .github/check-public-docs.py` from the repository root to check local entry-document links and image paths. This check does not contact external services or verify anchors.

For documentation-only edits, check local links, commands against actual scripts, image captions and rendered readability. Run a documented example when its behaviour is affected. State what you checked and what you could not check; never report an unexecuted command as passing.

## Open a pull request

Explain the user-facing problem, what changed and the evidence for the result. Keep application behaviour, data refreshes, dependency upgrades and presentation changes in separate reviewable scopes. Follow existing repository instructions and the Weavr operating contract where applicable. Do not include generated output unless the repository explicitly versions it.

## Sensitive reports

Do not put credentials, personal data or exploitable security details into public issues. Use GitHub's private vulnerability reporting option if available. If it is unavailable, ask the owner for a private reporting route without posting the sensitive details. No response-time commitment is implied.
