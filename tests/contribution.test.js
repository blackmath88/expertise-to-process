import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEnvelope, validateContribution, contributionMarkdown, buildContributionFiles, ENVELOPE_KEYS, slugify} from '../docs/app/lib/contribution.js';
import {exportContribution} from '../docs/app/lib/storage.js';
import {blankExtras} from '../docs/app/lib/guidance.js';
import {readData, clone} from './helpers.js';

async function sampleDraft() {
  const entry = await readData('processes/onboarding.json');
  return {process: clone(entry.process), ...blankExtras(), narrative: 'Ganze Geschichte mit Namen von Kolleginnen', classification: clone(entry.classification)};
}
const form = {summary: 'Kurz', scope: 'Unsere Einheit', constraints: 'Frist A\n\nKriterium B', openQuestions: 'Wer prüft?', familyId: 'personal'};

test('contribution starts pending, is valid after confirmation and keeps dimensions independent', async () => {
  const taxonomy = await readData('taxonomy.json');
  const draft = await sampleDraft();
  const pending = buildEnvelope(draft, form);
  assert.equal(pending.status, 'pending-review');
  assert.ok(validateContribution(pending, taxonomy).some(e => e.includes('bestätige')));
  const env = buildEnvelope(draft, form, {confirmed: true});
  assert.deepEqual(validateContribution(env, taxonomy), []);
  const e = env.candidateEntry;
  assert.equal(e.review.status, 'pending-review');
  assert.equal(e.effectiveness.status, 'untested');
  assert.equal(e.authority.status, 'none');
  assert.equal(e.provenance.sourceType, 'contribution');
  assert.deepEqual(e.context.constraints, ['Frist A', 'Kriterium B']);
  assert.deepEqual(env.openQuestions, ['Wer prüft?']);
});

test('narrative is excluded by default; redactions change only the copy, never the draft', async () => {
  const draft = await sampleDraft();
  const before = JSON.stringify(draft);
  const env = buildEnvelope(draft, {...form, removePain: true, removeNotes: true, removeSystems: true, removeOwner: true, removeFrequency: true, removeHypothesis: true}, {confirmed: true});
  assert.equal(env.narrative, undefined);
  const p = env.candidateEntry.process;
  assert.equal(p.pain, ''); assert.equal(p.owner, ''); assert.equal(p.frequency, ''); assert.equal(p.opportunity.hypothesis, '');
  assert.ok(p.steps.every(s => s.note === '' && s.system === ''));
  assert.equal(env.candidateEntry.kind, 'process-example');
  assert.equal(JSON.stringify(draft), before);
  const withNarrative = buildEnvelope(draft, {...form, removeNarrative: false}, {confirmed: true});
  assert.equal(withNarrative.narrative, draft.narrative);
});

test('tokens, settings, browser metadata and chat history never enter the export', async () => {
  const draft = await sampleDraft();
  Object.assign(draft, {token: 'secret-token', backend: 'https://x.example', history: [{role: 'user', content: 'chat'}], userAgent: 'Mozilla'});
  const env = buildEnvelope(draft, form, {confirmed: true});
  const text = JSON.stringify(env) + contributionMarkdown(env);
  for (const secret of ['secret-token', 'x.example', 'chat', 'Mozilla']) assert.ok(!text.includes(secret), secret);
  assert.ok(Object.keys(env).every(k => ENVELOPE_KEYS.includes(k)));
  assert.ok(validateContribution({...env, token: 'x'}, await readData('taxonomy.json')).some(e => e.includes('Unerwartetes Feld')));
});

test('exported files contain exactly the previewed envelope, with honest wording', async () => {
  const draft = await sampleDraft();
  const env = buildEnvelope(draft, form, {contributionId: 'beitrag-2026-10-15-test', createdAt: '2026-10-15T10:00:00.000Z', confirmed: true});
  const preview = JSON.stringify(env, null, 2);
  const [json, md] = exportContribution(env, await readData('taxonomy.json'));
  assert.equal(json.content, preview);
  assert.equal(json.name, 'beitrag-2026-10-15-test.json');
  assert.match(md.content, /Prüfung ausstehend/);
  assert.match(md.content, /Datei herunterladen[\s\S]*fachlich prüfen lassen[\s\S]*Kuration aufnehmen/i);
  assert.doesNotMatch(md.content, /eingereicht wurde|veröffentlicht wurde|freigegeben wurde|erfolgreich/i);
  assert.deepEqual(buildContributionFiles(env).map(f => f.type), ['application/json', 'text/markdown']);
});

test('candidate validation catches missing family and slugs are safe', async () => {
  const taxonomy = await readData('taxonomy.json');
  const draft = await sampleDraft(); draft.classification.familyId = '';
  const env = buildEnvelope(draft, {...form, familyId: ''}, {confirmed: true});
  assert.ok(validateContribution(env, taxonomy).some(e => e.includes('familyId')));
  assert.equal(slugify('Spesen über «Zürich» <script>'), 'spesen-ueber-zuerich-script');
  assert.equal(slugify('???'), 'beitrag');
});
