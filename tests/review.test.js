import test from 'node:test';
import assert from 'node:assert/strict';
import {blank, example} from '../docs/app/model.js';
import {reviewProcess, reportMarkdown, completeness, findLoops} from '../docs/app/lib/review.js';
import {blankExtras} from '../docs/app/lib/guidance.js';
import {readData} from './helpers.js';

const all = r => [...r.facts, ...r.questions, ...r.hypotheses];

test('blank process: everything unknown stays a question, no invented facts or hypotheses', () => {
  const r = reviewProcess(blank(), blankExtras());
  assert.deepEqual(r.facts, []);
  assert.deepEqual(r.hypotheses, []);
  for (const id of ['q-trigger', 'q-outcome', 'q-owner', 'q-frequency', 'q-duplicate']) assert.ok(r.questions.some(q => q.id === id), id);
});

test('missing role and unclear owner cite the step / field', () => {
  const p = example();
  p.steps[2].role = '';
  const r = reviewProcess(p, blankExtras());
  const role = r.questions.find(q => q.id === 'q-role-s3');
  assert.deepEqual(role.refs.map(x => x.id), ['s3']);
  const owner = r.questions.find(q => q.id === 'q-owner');
  assert.match(owner.detail, /Noch zu klären/);
  assert.deepEqual(owner.refs.map(x => x.id), ['owner']);
});

test('rework loop is reported as a fact and questioned, not judged as waste', async () => {
  const entry = await readData('processes/onboarding.json');
  const p = entry.process;
  assert.deepEqual(findLoops(p), [{from: 's4', to: 's2', label: ''}]);
  const r = reviewProcess(p, blankExtras());
  assert.ok(r.facts.some(f => f.id === 'fact-loop-s4-s2'));
  const q = r.questions.find(f => f.id === 'q-loop-s4-s2');
  assert.match(q.detail, /nicht automatisch Verschwendung/);
  assert.deepEqual(q.refs.map(x => x.id), ['s4', 's2']);
  const h = r.hypotheses.find(f => f.id === 'h-criteria-s3');
  assert.equal(h.pattern, 'completeness-check');
});

test('duplicate entry becomes a hypothesis only when reported', () => {
  const p = blank();
  Object.assign(p, {trigger: 'A', outcome: 'B', owner: 'C'});
  assert.ok(!reviewProcess(p, blankExtras()).hypotheses.some(h => h.id === 'h-duplicate'));
  const extras = blankExtras(); extras.reported.duplicateEntry = 'yes';
  const r = reviewProcess(p, extras);
  assert.ok(r.facts.some(f => f.id === 'fact-duplicate'));
  assert.equal(r.hypotheses.find(h => h.id === 'h-duplicate').refs[0].id, 'reported.duplicateEntry');
});

test('no invented numbers, savings or compliance verdicts in any finding or report', async () => {
  const entry = await readData('processes/funding.json');
  const r = reviewProcess(entry.process, blankExtras());
  const report = reportMarkdown(entry.process, r).split('\n').slice(3).join('\n');
  const text = all(r).map(f => f.title + ' ' + f.detail).join(' ') + report;
  assert.doesNotMatch(text, /(\d+\s*%|Stunden|CHF|spart|Einsparung|konform|rechtswidrig|verstösst)/i);
  assert.match(reportMarkdown(entry.process, r), /keine geschätzten Einsparungen/);
  for (const f of all(r)) assert.ok(Array.isArray(f.refs));
});

test('completeness is a checklist, not a score', () => {
  const c = completeness(example(), blankExtras());
  assert.equal(c.total, c.items.length);
  assert.ok(c.items.find(i => i.id === 'owner').done === false);
  assert.ok(c.items.find(i => i.id === 'structure').done);
});

test('markdown report separates facts, questions and hypotheses and keeps text literal', () => {
  const p = example(); p.pain = '<img src=x onerror=alert(1)>';
  const md = reportMarkdown(p, reviewProcess(p, blankExtras()));
  for (const h of ['## Gemeldete Fakten', '## Offene Fragen', '## Verbesserungshypothesen']) assert.ok(md.includes(h));
  assert.ok(md.includes('(Bezug: s2'));
});
