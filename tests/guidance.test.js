import test from 'node:test';
import assert from 'node:assert/strict';
import {blank, example, issues} from '../docs/app/model.js';
import {blankExtras, createProposal, previewProposal, editProposal, applyProposal, createHistory, nextQuestion, proposalForAnswer, scriptedTurns} from '../docs/app/lib/guidance.js';
import {createOfflineAdapter} from '../docs/app/lib/ai.js';

const fresh = () => ({process: blank(), ...blankExtras()});

test('preview describes exactly what accept changes; reject leaves the draft untouched', () => {
  const draft = fresh();
  const before = JSON.stringify(draft);
  const proposal = createProposal([{op: 'set', field: 'trigger', value: 'Antrag ist eingegangen'}, {op: 'addStep', step: {id: 's1', label: 'Antrag prüfen', role: 'Sekretariat'}}]);
  const preview = previewProposal(draft, proposal);
  assert.equal(preview.error, null);
  assert.match(preview.lines[0].text, /Auslöser: «leer» → «Antrag ist eingegangen»/);
  assert.match(preview.lines[1].text, /Neuer Schritt 1: «Antrag prüfen» · Sekretariat/);
  assert.equal(JSON.stringify(draft), before, 'preview must not mutate');
  const next = applyProposal(draft, proposal);
  assert.equal(JSON.stringify(draft), before, 'apply returns a copy');
  assert.equal(next.process.trigger, 'Antrag ist eingegangen');
  assert.deepEqual(next.process.steps.map(s => [s.id, s.label, s.role, s.next]), [['s1', 'Antrag prüfen', 'Sekretariat', 'end']]);
});

test('edited proposal applies the edited values, and the preview shows them', () => {
  const draft = fresh();
  const proposal = createProposal([{op: 'addStep', step: {id: 's1', label: 'Falsch', role: 'X'}}]);
  const edited = editProposal(proposal, {'0.step.label': 'Richtig', '0.step.role': 'Team'});
  assert.match(previewProposal(draft, edited).lines[0].text, /«Richtig» · Team/);
  assert.equal(applyProposal(draft, edited).process.steps[0].label, 'Richtig');
  assert.equal(proposal.ops[0].step.label, 'Falsch', 'original proposal unchanged');
});

test('undo restores the exact pre-accept draft and detects later edits', () => {
  const history = createHistory();
  const draft = fresh();
  const proposal = createProposal([{op: 'set', field: 'title', value: 'Neu'}], {label: 'Titel'});
  const next = applyProposal(draft, proposal);
  history.push('Titel', draft, next);
  assert.equal(history.peek().label, 'Titel');
  const clean = history.undo(next);
  assert.deepEqual(clean.draft, draft);
  assert.equal(clean.changedSince, false);
  history.push('Titel', draft, next);
  const edited = structuredClone(next); edited.process.owner = 'später';
  assert.equal(history.undo(edited).changedSince, true);
  assert.equal(history.undo(edited), null);
});

test('invalid proposals cannot apply and say why', () => {
  const draft = {process: example(), ...blankExtras()};
  for (let i = draft.process.steps.length; i < 15; i++) draft.process.steps.push({...draft.process.steps[0], id: 'sx' + i, next: 'end'});
  const proposal = createProposal([{op: 'addStep', step: {id: 's99', label: 'Zu viel', role: ''}}]);
  assert.match(previewProposal(draft, proposal).error, /Maximal 15/);
  assert.throws(() => applyProposal(draft, proposal), /Maximal 15/);
});

test('guided questions come one at a time in a useful order and stop when complete', () => {
  let draft = fresh();
  const state = {skipped: [], stepsDone: false};
  const order = [];
  const answers = {title: {value: 'Raum buchen'}, trigger: {value: 'Kurs ist geplant'}, outcome: {value: 'Raum ist reserviert'}, owner: {value: 'Sekretariat'}, duplicate: {value: 'no'}, frequency: {value: 'monatlich'}, pain: {value: 'Doppelte Buchungen'}};
  for (let guard = 0; guard < 20; guard++) {
    const q = nextQuestion(draft, state);
    if (!q) break;
    order.push(q.id);
    let answer = answers[q.id];
    if (q.id === 'steps') {
      if (draft.process.steps.length >= 2) { state.stepsDone = true; continue; }
      answer = {label: draft.process.steps.length ? 'Raum reservieren' : 'Bedarf prüfen', role: 'Sekretariat'};
    }
    if (q.id === 'decision') answer = {afterId: 's1', label: 'Raum frei?', role: 'Raumplanung', noTarget: 'rework', reworkLabel: 'Alternative suchen', reworkRole: 'Sekretariat', returnTo: 's1'};
    draft = applyProposal(draft, proposalForAnswer(draft, q, answer));
  }
  assert.deepEqual(order, ['title', 'trigger', 'outcome', 'owner', 'steps', 'steps', 'steps', 'decision', 'duplicate', 'frequency', 'pain']);
  assert.deepEqual(issues(draft.process), []);
  assert.deepEqual(draft.process.steps.map(s => s.label), ['Bedarf prüfen', 'Raum frei?', 'Alternative suchen', 'Raum reservieren']);
  assert.equal(nextQuestion(draft, state), null);
});

test('scripted example builds a valid map with a rework loop; adapter is offline', async () => {
  let draft = fresh();
  const adapter = createOfflineAdapter();
  assert.equal(adapter.makesNetworkRequests, false);
  const turns = await adapter.proposeProcess();
  assert.equal(turns.length, scriptedTurns().length);
  for (const t of turns) { assert.equal(t.proposal.source, 'scripted-example'); draft = applyProposal(draft, t.proposal); }
  assert.deepEqual(issues(draft.process), []);
  const decision = draft.process.steps.find(s => s.type === 'decision');
  assert.equal(decision.no, 's4');
  assert.equal(draft.process.steps.find(s => s.id === 's4').next, 's2');
  assert.equal(decision.yes, 's5');
  assert.equal(draft.reported.duplicateEntry, 'yes');
});
