// Storage boundaries. Two adapters:
// - static library: read-only, fetches committed JSON through relative URLs (works below any Pages prefix)
// - browser drafts: explicit local save/load/delete with understandable failures
// A later self-hosted service can implement the same functions. Nothing here writes to an institution.
import {normalize} from '../model.js';
import {validateLibrary} from './library.js';
import {blankExtras} from './guidance.js';
import {buildContributionFiles} from './contribution.js';

export const DRAFT_KEY = 'pietro-app-draft-v2';
export const LEGACY_KEY = 'pietro-app-v1';
const MAX_DRAFT_CHARS = 400000;

/**
 * @param {{baseUrl: string|URL, fetchImpl?: typeof fetch}} options baseUrl is the folder containing library-index.json
 */
export function createStaticLibrary({baseUrl, fetchImpl = (...args) => fetch(...args)}) {
  let cache = null;
  async function getJson(path) {
    const url = new URL(path, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) throw Error('Externe Bibliotheksadresse abgelehnt.');
    const response = await fetchImpl(url, {headers: {Accept: 'application/json'}, cache: 'no-cache'});
    if (!response.ok) throw Error(`Datei ${path} nicht verfügbar (Status ${response.status}).`);
    const text = await response.text();
    try { return {value: JSON.parse(text), size: text.length}; } catch { throw Error(`Datei ${path} ist kein gültiges JSON.`); }
  }
  async function load() {
    if (cache) return cache;
    const [index, taxonomy] = await Promise.all([getJson('library-index.json'), getJson('taxonomy.json')]);
    if (!Array.isArray(index.value?.entries)) throw Error('Bibliotheksindex ist ungültig.');
    const entries = {}, sizes = {index: index.size};
    await Promise.all(index.value.entries.map(async item => {
      if (typeof item?.path !== 'string') return;
      const file = await getJson(item.path);
      entries[item.path] = file.value; sizes[item.path] = file.size;
    }));
    const errors = validateLibrary({index: index.value, entries, taxonomy: taxonomy.value, sizes});
    if (errors.length) throw Object.assign(Error('Die Bibliothek enthält ungültige Einträge.'), {details: errors});
    cache = {taxonomy: taxonomy.value, entries: index.value.entries.map(item => entries[item.path])};
    return cache;
  }
  return {
    load,
    async listPublished() { return (await load()).entries; },
    async getPublished(id) { return (await load()).entries.find(e => e.id === id) || null; },
    async taxonomy() { return (await load()).taxonomy; },
    reset() { cache = null; }
  };
}

function normalizeExtras(raw) {
  const extras = blankExtras();
  if (!raw || typeof raw !== 'object') return extras;
  if (typeof raw.narrative === 'string') extras.narrative = raw.narrative.slice(0, 8000);
  for (const key of Object.keys(extras.reported)) if (['yes', 'no', 'unknown'].includes(raw.reported?.[key])) extras.reported[key] = raw.reported[key];
  const c = raw.classification;
  if (c && typeof c === 'object') {
    if (typeof c.familyId === 'string' && c.familyId.length <= 60) extras.classification.familyId = c.familyId;
    for (const key of ['activityTags', 'frictionTags']) if (Array.isArray(c[key])) extras.classification[key] = c[key].filter(t => typeof t === 'string' && t.length <= 60).slice(0, 30);
  }
  return extras;
}

/**
 * Parse a draft from JSON text. Accepts a v1 process file (optionally with the `workbench`
 * extension written by this app) and the stored draft envelope. Throws on anything invalid.
 */
export function parseDraft(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw Error('Die Datei ist kein gültiges JSON.'); }
  if (raw?.kind === 'pietro-draft') return {process: normalize(raw.process), ...normalizeExtras(raw)};
  return {process: normalize(raw), ...normalizeExtras(raw?.workbench)};
}

/** Portable process file: a valid v1 process; workbench extras ride along in an ignored field. */
export function serializeProcessFile(draft) {
  return JSON.stringify({...draft.process, workbench: {schemaVersion: 1, narrative: draft.narrative, reported: draft.reported, classification: draft.classification}}, null, 2);
}

/** @param {{storage?: Storage|null}} options */
export function createDraftStore({storage} = {}) {
  const store = () => {
    if (storage !== undefined) { if (!storage) throw Error('unavailable'); return storage; }
    return globalThis.localStorage;
  };
  return {
    /** @returns {{status:'empty'}|{status:'ok', draft, savedAt}|{status:'corrupt', message}|{status:'unavailable', message}} */
    loadDraft() {
      let text, legacy = false;
      try {
        const s = store();
        text = s.getItem(DRAFT_KEY);
        if (text === null) { text = s.getItem(LEGACY_KEY); legacy = text !== null; }
      } catch { return {status: 'unavailable', message: 'Der Browser-Speicher ist in diesem Browser nicht zugänglich. Du kannst trotzdem arbeiten und als Datei exportieren.'}; }
      if (text === null) return {status: 'empty'};
      try {
        if (legacy) return {status: 'ok', draft: {process: normalize(JSON.parse(text)), ...blankExtras()}, savedAt: null, legacy: true};
        const raw = JSON.parse(text);
        return {status: 'ok', draft: parseDraft(text), savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : null};
      } catch {
        return {status: 'corrupt', message: 'Der gespeicherte Entwurf ist beschädigt und wurde nicht geladen. Er bleibt gespeichert, bis du ihn löschst.'};
      }
    },
    /** @returns {{ok:true, savedAt}|{ok:false, message}} */
    saveDraft(draft) {
      const savedAt = new Date().toISOString();
      const text = JSON.stringify({kind: 'pietro-draft', schemaVersion: 2, savedAt, process: normalize(draft.process), narrative: draft.narrative, reported: draft.reported, classification: draft.classification});
      if (text.length > MAX_DRAFT_CHARS) return {ok: false, message: 'Der Entwurf ist zu gross für den Browser-Speicher. Bitte als Datei exportieren.'};
      try {
        const s = store();
        s.setItem(DRAFT_KEY, text);
        try { s.removeItem(LEGACY_KEY); } catch { /* the new key is authoritative */ }
        return {ok: true, savedAt};
      } catch (error) {
        const quota = error?.name === 'QuotaExceededError' || error?.code === 22;
        return {ok: false, message: quota ? 'Der Browser-Speicher ist voll. Der Entwurf wurde nicht gespeichert; bitte als Datei exportieren.' : 'Speichern ist in diesem Browser nicht möglich (z. B. privater Modus). Bitte als Datei exportieren.'};
      }
    },
    deleteDraft() {
      try { const s = store(); s.removeItem(DRAFT_KEY); s.removeItem(LEGACY_KEY); return {ok: true}; }
      catch { return {ok: false, message: 'Der Browser-Speicher ist nicht zugänglich; es konnte nichts gelöscht werden.'}; }
    }
  };
}

/** Contribution export: produces files for download. There is deliberately no network write. */
export function exportContribution(envelope, taxonomy) {
  return buildContributionFiles(envelope, taxonomy);
}
