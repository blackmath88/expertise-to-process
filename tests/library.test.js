import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, cp, writeFile, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateLibrary, validateEntry, searchEntries, compareEntries, relatedForDraft, suggestClassification, questionsBeforeReuse} from '../docs/app/lib/library.js';
import {validateDirectory} from '../scripts/validate-library.mjs';
import {createStaticLibrary} from '../docs/app/lib/storage.js';
import {loadLibraryFiles, clone} from './helpers.js';

test('published library is valid, fictional and honestly labelled', async () => {
  const lib = await loadLibraryFiles();
  assert.deepEqual(validateLibrary(lib), []);
  const entries = Object.values(lib.entries);
  assert.equal(entries.filter(e => e.kind === 'process-example').length, 3);
  assert.equal(entries.filter(e => e.kind === 'pattern').length, 2);
  for (const e of entries) {
    assert.equal(e.fictional, true);
    assert.equal(e.authority.status, 'none');
    assert.equal(e.effectiveness.status, 'untested');
    assert.notEqual(e.review.status, 'reviewed');
  }
});

test('duplicate IDs, broken references, bad paths and invalid process graphs are caught', async () => {
  const base = await loadLibraryFiles();
  const cases = {
    duplicate: lib => lib.index.entries.push({...lib.index.entries[0], path: 'processes/copy.json'}) && (lib.entries['processes/copy.json'] = lib.entries['processes/onboarding.json']),
    relatedMissing: lib => lib.entries['processes/event.json'].relatedIds.push('does-not-exist'),
    patternNotPattern: lib => lib.entries['processes/event.json'].patternIds.push('funding'),
    traversal: lib => { lib.index.entries[0].path = '../secrets.json'; },
    absoluteUrl: lib => { lib.index.entries[0].path = 'https://evil.example/x.json'; },
    danglingEdge: lib => { lib.entries['processes/funding.json'].process.steps[0].next = 's99'; },
    closedCycle: lib => { const s = lib.entries['processes/event.json'].process.steps; s[5].next = 's5'; },
    badEnum: lib => { lib.entries['processes/funding.json'].review.status = 'approved'; },
    fictionalAuthority: lib => { Object.assign(lib.entries['processes/funding.json'].authority, {status: 'binding', scope: 'Universität', authoritySource: 'Erfunden'}); },
    unknownTag: lib => lib.entries['processes/event.json'].classification.activityTags.push('magic'),
    oversized: lib => { lib.sizes = {'processes/onboarding.json': 70000}; },
    idMismatch: lib => { lib.entries['processes/event.json'].id = 'event-2'; }
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const lib = clone(base);
    mutate(lib);
    assert.ok(validateLibrary(lib).length > 0, name + ' should be rejected');
  }
});

test('validator script checks a directory and reports unindexed files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pietro-lib-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  await cp(new URL('../docs/app/data/', import.meta.url), dir, {recursive: true});
  assert.deepEqual((await validateDirectory(dir)).errors, []);
  await writeFile(join(dir, 'processes', 'stray.json'), await readFile(join(dir, 'processes', 'event.json')));
  const {errors} = await validateDirectory(dir);
  assert.ok(errors.some(e => e.includes('nicht im Index')));
});

test('search covers title and summary; filters by family, tag and kind; empty result is empty', async () => {
  const {entries} = await loadLibraryFiles();
  const list = Object.values(entries);
  assert.deepEqual(searchEntries(list, {query: 'förderung'}).map(e => e.id), ['funding']);
  assert.deepEqual(searchEntries(list, {query: 'ARBEITSTAG'}).map(e => e.id), ['onboarding']);
  assert.deepEqual(searchEntries(list, {familyId: 'kommunikation'}).map(e => e.id), ['event']);
  assert.deepEqual(searchEntries(list, {activityTag: 'completeness-check', kind: 'process'}).map(e => e.id).sort(), ['funding', 'onboarding']);
  assert.equal(searchEntries(list, {kind: 'pattern'}).length, 2);
  assert.deepEqual(searchEntries(list, {query: 'raumfahrt'}), []);
});

test('onboarding and funding share the completeness pattern with different local requirements', async () => {
  const {entries} = await loadLibraryFiles();
  const onboarding = entries['processes/onboarding.json'], funding = entries['processes/funding.json'];
  const c = compareEntries(onboarding, funding);
  assert.ok(c.sharedActivityTags.includes('completeness-check'));
  assert.ok(c.sharedPatternIds.includes('completeness-check'));
  assert.notDeepEqual(c.constraintsA, c.constraintsB);
  assert.ok(c.constraintsA.some(x => x.includes('Bankverbindung')));
  assert.ok(c.constraintsB.some(x => x.includes('Datenmanagementplan')));
  assert.ok(c.rolesA.includes('HR-Administration') && c.rolesB.includes('Forschungsadministration'));
  const questions = questionsBeforeReuse([onboarding, funding], [entries['patterns/completeness-check.json']]);
  assert.ok(questions.some(q => q.source === 'completeness-check'));
});

test('draft relatedness and keyword suggestions are deterministic and cite evidence', async () => {
  const {entries, taxonomy} = await loadLibraryFiles();
  const list = Object.values(entries);
  const ranked = relatedForDraft({familyId: 'finanzen', activityTags: ['completeness-check', 'request-missing-information'], frictionTags: []}, list);
  assert.ok(ranked.some(r => r.entry.id === 'completeness-check'));
  assert.ok(ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score));
  assert.ok(ranked.some(r => r.entry.id === 'onboarding') && ranked.some(r => r.entry.id === 'funding'));
  assert.ok(!ranked.some(r => r.entry.id === 'event'));
  const s = suggestClassification(entries['processes/funding.json'].process, taxonomy);
  const complete = s.activityTags.find(t => t.id === 'completeness-check');
  assert.deepEqual(complete.evidence[0], {ref: 's4', keyword: 'vollständig'});
  assert.equal(s.source, 'keyword-rule');
});

test('static library loads relative files, reports failures, rejects invalid data', async () => {
  const lib = await loadLibraryFiles();
  const files = {'library-index.json': lib.index, 'taxonomy.json': lib.taxonomy, ...lib.entries};
  const requested = [];
  const fakeFetch = overrides => async url => {
    const path = String(url).replace('https://host.example/repo/app/data/', '');
    requested.push(String(url));
    if (overrides[path] === 500) return {ok: false, status: 500, text: async () => ''};
    const body = overrides[path] ?? files[path];
    return body ? {ok: true, status: 200, text: async () => JSON.stringify(body)} : {ok: false, status: 404, text: async () => ''};
  };
  const ok = createStaticLibrary({baseUrl: 'https://host.example/repo/app/data/', fetchImpl: fakeFetch({})});
  assert.equal((await ok.listPublished()).length, 5);
  assert.equal((await ok.getPublished('funding')).title, 'Forschungsförderungsantrag vorbereiten');
  assert.ok(requested.every(u => u.startsWith('https://host.example/repo/app/data/')));
  await assert.rejects(createStaticLibrary({baseUrl: 'https://host.example/repo/app/data/', fetchImpl: fakeFetch({'library-index.json': 500})}).load(), /Status 500/);
  const broken = clone(lib.entries['processes/event.json']); broken.relatedIds = ['ghost'];
  await assert.rejects(createStaticLibrary({baseUrl: 'https://host.example/repo/app/data/', fetchImpl: fakeFetch({'processes/event.json': broken})}).load(), err => err.details.some(d => d.includes('ghost')));
});

test('entry validator rejects patterns without steps and processes without a valid v1 model', async () => {
  const {entries, taxonomy} = await loadLibraryFiles();
  const pattern = clone(entries['patterns/explicit-handover.json']); pattern.pattern.steps = [];
  assert.ok(validateEntry(pattern, taxonomy).length);
  const example = clone(entries['processes/event.json']); example.process.version = 2;
  assert.ok(validateEntry(example, taxonomy).some(e => e.includes('Prozess ungültig')));
});
