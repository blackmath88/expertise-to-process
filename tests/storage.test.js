import test from 'node:test';
import assert from 'node:assert/strict';
import {example, normalize} from '../docs/app/model.js';
import {createDraftStore, parseDraft, serializeProcessFile, DRAFT_KEY, LEGACY_KEY} from '../docs/app/lib/storage.js';
import {blankExtras} from '../docs/app/lib/guidance.js';

function memory() {
  const data = new Map();
  return {getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data};
}
const draft = () => ({process: example(), ...blankExtras(), narrative: 'Notiz', classification: {familyId: 'kommunikation', activityTags: ['publish'], frictionTags: []}});

test('explicit save survives a reload; delete removes it', () => {
  const storage = memory();
  const store = createDraftStore({storage});
  assert.equal(store.loadDraft().status, 'empty');
  assert.equal(store.saveDraft(draft()).ok, true);
  const again = createDraftStore({storage}).loadDraft();
  assert.equal(again.status, 'ok');
  assert.deepEqual(again.draft, draft());
  assert.equal(store.deleteDraft().ok, true);
  assert.equal(store.loadDraft().status, 'empty');
});

test('legacy v1 key still loads', () => {
  const storage = memory();
  storage.setItem(LEGACY_KEY, JSON.stringify(example()));
  const loaded = createDraftStore({storage}).loadDraft();
  assert.equal(loaded.status, 'ok');
  assert.deepEqual(loaded.draft.process, example());
});

test('corruption, quota and unavailable storage are reported understandably', () => {
  const storage = memory();
  storage.setItem(DRAFT_KEY, '{broken');
  const corrupt = createDraftStore({storage}).loadDraft();
  assert.equal(corrupt.status, 'corrupt');
  assert.ok(storage.data.has(DRAFT_KEY), 'corrupt data is not silently deleted');
  const full = {...memory(), setItem: () => { throw Object.assign(Error('full'), {name: 'QuotaExceededError'}); }};
  const result = createDraftStore({storage: full}).saveDraft(draft());
  assert.equal(result.ok, false);
  assert.match(result.message, /voll/);
  const blocked = createDraftStore({storage: null});
  assert.equal(blocked.loadDraft().status, 'unavailable');
  assert.equal(blocked.saveDraft(draft()).ok, false);
});

test('v1 process files round-trip, with and without workbench extras', () => {
  const v1 = JSON.stringify(example());
  const imported = parseDraft(v1);
  assert.deepEqual(imported.process, example());
  assert.deepEqual(normalize(JSON.parse(serializeProcessFile(imported))), example(), 'exported file is still a valid v1 process');
  const d = draft();
  assert.deepEqual(parseDraft(serializeProcessFile(d)), d);
});

test('invalid imports throw and so never replace an existing draft', () => {
  for (const text of ['not json', '{"version":2,"steps":[]}', JSON.stringify({...example(), steps: [{id: 's1', type: 'task', label: 'x', role: '', system: '', note: '', next: 'missing'}]})]) assert.throws(() => parseDraft(text));
});
