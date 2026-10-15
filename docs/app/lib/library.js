// Published process library: validation, search, categories and deterministic comparison.
// All matching here is tag-based. Nothing in this module interprets meaning.
import {normalize, issues} from '../model.js';

export const KINDS = ['process-example', 'improvement-case', 'pattern'];
export const SOURCE_TYPES = ['fictional-example', 'curated-pattern', 'contribution'];
export const REVIEW_STATUS = {
  'not-reviewed': 'Nicht fachlich geprüft',
  'pending-review': 'Prüfung ausstehend',
  'reviewed': 'Fachlich geprüft für den genannten Kontext'
};
export const EFFECTIVENESS_STATUS = {
  'untested': 'Wirkung nicht getestet',
  'anecdotal': 'Einzelne Erfahrungsberichte',
  'measured': 'Wirkung gemessen'
};
export const AUTHORITY_STATUS = {
  'none': 'Keine verbindliche Vorgabe',
  'local-practice': 'Lokal vereinbarte Praxis',
  'binding': 'Verbindliche Vorgabe'
};
export const MAX_ENTRY_BYTES = 64000;
export const MAX_INDEX_BYTES = 32000;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH = /^(processes|patterns)\/[a-z0-9-]+\.json$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isText = (v, max = 4000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isTextOrNull = (v, max = 400) => v === null || isText(v, max);
const isTextList = (v, max = 400) => Array.isArray(v) && v.length <= 30 && v.every(x => isText(x, max));

/** Validate a single entry envelope. Returns a list of German messages; empty means valid. */
export function validateEntry(entry, taxonomy) {
  const errors = [];
  const where = typeof entry?.id === 'string' ? entry.id : '(ohne ID)';
  const fail = message => errors.push(`${where}: ${message}`);
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['Eintrag ist kein Objekt.'];
  if (entry.schemaVersion !== 1) fail('schemaVersion muss 1 sein.');
  if (typeof entry.id !== 'string' || !ID.test(entry.id) || entry.id.length > 60) fail('ID muss ein kleingeschriebener Slug sein.');
  if (!KINDS.includes(entry.kind)) fail('Unbekannte Art (kind).');
  if (!isText(entry.title, 160)) fail('Titel fehlt oder ist zu lang.');
  if (!isText(entry.summary, 600)) fail('Zusammenfassung fehlt oder ist zu lang.');
  if (typeof entry.fictional !== 'boolean') fail('fictional muss true oder false sein.');
  if (!isText(entry.context?.scope, 600)) fail('context.scope fehlt.');
  if (!isTextList(entry.context?.constraints ?? null, 600)) fail('context.constraints muss eine Textliste sein.');
  const c = entry.classification;
  const families = new Set((taxonomy?.families || []).map(f => f.id));
  const activities = new Set((taxonomy?.activityTags || []).map(t => t.id));
  const frictions = new Set((taxonomy?.frictionTags || []).map(t => t.id));
  if (!c || !families.has(c.familyId)) fail('classification.familyId ist unbekannt.');
  if (!Array.isArray(c?.activityTags) || !c.activityTags.every(t => activities.has(t))) fail('classification.activityTags enthält unbekannte Tags.');
  if (!Array.isArray(c?.frictionTags) || !c.frictionTags.every(t => frictions.has(t))) fail('classification.frictionTags enthält unbekannte Tags.');
  const p = entry.provenance;
  if (!p || !SOURCE_TYPES.includes(p.sourceType) || !isText(p.sourceLabel, 400) || !isTextList(p.sourceRefs ?? null, 200)) fail('provenance ist unvollständig.');
  const r = entry.review;
  if (!r || !(r.status in REVIEW_STATUS) || !isTextOrNull(r.reviewedByRole) || !(r.reviewedAt === null || (typeof r.reviewedAt === 'string' && DATE.test(r.reviewedAt)))) fail('review ist ungültig.');
  if (r?.status === 'reviewed' && (!r.reviewedByRole || !r.reviewedAt)) fail('Eine Prüfung braucht prüfende Rolle und Datum.');
  const e = entry.effectiveness;
  if (!e || !(e.status in EFFECTIVENESS_STATUS) || !isTextList(e.evidenceRefs ?? null)) fail('effectiveness ist ungültig.');
  if (e && e.status !== 'untested' && !e.evidenceRefs?.length) fail('Eine Wirkungsangabe braucht Belege (evidenceRefs).');
  const a = entry.authority;
  if (!a || !(a.status in AUTHORITY_STATUS) || !isTextOrNull(a.scope) || !isTextOrNull(a.authoritySource)) fail('authority ist ungültig.');
  if (a && a.status !== 'none' && (!a.scope || !a.authoritySource)) fail('Eine Vorgabe braucht Geltungsbereich und Quelle.');
  if (entry.fictional && a?.status !== 'none') fail('Fiktive Beispiele dürfen keine Verbindlichkeit beanspruchen.');
  if (entry.fictional && e?.status !== 'untested') fail('Fiktive Beispiele dürfen keine Wirkung beanspruchen.');
  const m = entry.maintenance;
  if (!m || !isTextOrNull(m.ownerRole) || !(m.reviewDue === null || (typeof m.reviewDue === 'string' && DATE.test(m.reviewDue)))) fail('maintenance ist ungültig.');
  for (const key of ['relatedIds', 'patternIds']) {
    if (!Array.isArray(entry[key]) || !entry[key].every(x => typeof x === 'string' && ID.test(x))) fail(`${key} muss eine Liste von IDs sein.`);
    else if (entry[key].includes(entry.id)) fail(`${key} verweist auf sich selbst.`);
  }
  if (entry.openQuestions !== undefined && !isTextList(entry.openQuestions, 600)) fail('openQuestions muss eine Textliste sein.');
  if (entry.kind === 'pattern') {
    const pat = entry.pattern;
    if (!pat || !Array.isArray(pat.steps) || !pat.steps.length || pat.steps.length > 15 || !pat.steps.every(s => isText(s?.label, 160) && isTextOrNull(s?.roleHint ?? null, 160))) fail('pattern.steps fehlt oder ist ungültig.');
    for (const key of ['prerequisites', 'limits', 'questionsBeforeReuse']) if (!isTextList(pat?.[key] ?? null, 600)) fail(`pattern.${key} muss eine Textliste sein.`);
    if (entry.process !== undefined) fail('Ein Muster enthält keinen Prozess.');
  } else if (KINDS.includes(entry.kind)) {
    try {
      const process = normalize(entry.process);
      for (const problem of issues(process)) fail('Prozess: ' + problem);
    } catch (error) { fail('Prozess ungültig: ' + error.message); }
    if (entry.pattern !== undefined) fail('Ein Prozessbeispiel enthält kein Muster.');
  }
  return errors;
}

/** Validate an index plus its loaded entries ({path: entry}) as a whole library. */
export function validateLibrary({index, entries, taxonomy, sizes = {}}) {
  const errors = [];
  if (!index || index.schemaVersion !== 1 || !Array.isArray(index.entries)) return ['Index: schemaVersion 1 und entries[] erwartet.'];
  if ((sizes.index ?? 0) > MAX_INDEX_BYTES) errors.push('Index ist zu gross.');
  const ids = new Set(), paths = new Set(), byId = new Map();
  for (const item of index.entries) {
    if (!item || typeof item.id !== 'string' || !ID.test(item.id)) { errors.push('Index: ungültige ID.'); continue; }
    if (ids.has(item.id)) errors.push(`Index: doppelte ID ${item.id}.`);
    ids.add(item.id);
    if (typeof item.path !== 'string' || !PATH.test(item.path)) { errors.push(`Index: ungültiger Pfad für ${item.id}.`); continue; }
    if (paths.has(item.path)) errors.push(`Index: Pfad ${item.path} doppelt.`);
    paths.add(item.path);
    const entry = entries[item.path];
    if (!entry) { errors.push(`Index: Datei ${item.path} fehlt.`); continue; }
    if ((sizes[item.path] ?? 0) > MAX_ENTRY_BYTES) errors.push(`${item.path}: Datei ist zu gross.`);
    if (entry.id !== item.id) errors.push(`Index: ${item.path} enthält ID ${entry.id}, erwartet ${item.id}.`);
    if (item.kind !== undefined && item.kind !== entry.kind) errors.push(`Index: Art von ${item.id} stimmt nicht mit der Datei überein.`);
    const folder = entry.kind === 'pattern' ? 'patterns/' : 'processes/';
    if (!item.path.startsWith(folder)) errors.push(`${item.id}: liegt im falschen Ordner.`);
    errors.push(...validateEntry(entry, taxonomy));
    byId.set(item.id, entry);
  }
  for (const entry of byId.values()) {
    for (const ref of entry.relatedIds || []) if (!byId.has(ref)) errors.push(`${entry.id}: relatedIds verweist auf fehlenden Eintrag ${ref}.`);
    for (const ref of entry.patternIds || []) {
      if (!byId.has(ref)) errors.push(`${entry.id}: patternIds verweist auf fehlenden Eintrag ${ref}.`);
      else if (byId.get(ref).kind !== 'pattern') errors.push(`${entry.id}: patternIds verweist auf ${ref}, das kein Muster ist.`);
    }
  }
  return errors;
}

export const labelFor = (taxonomy, group, id) => (taxonomy?.[group] || []).find(t => t.id === id)?.label || id;

const fold = s => String(s || '').toLocaleLowerCase('de-CH');

/** Search title and summary; filter by family, activity tag and kind. */
export function searchEntries(entries, {query = '', familyId = '', activityTag = '', kind = ''} = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (familyId && entry.classification.familyId !== familyId) return false;
    if (activityTag && !entry.classification.activityTags.includes(activityTag)) return false;
    if (kind === 'pattern' && entry.kind !== 'pattern') return false;
    if (kind === 'process' && entry.kind === 'pattern') return false;
    const haystack = fold(entry.title + ' ' + entry.summary);
    return words.every(w => haystack.includes(w));
  });
}

/** Compare two entries by their declared tags, patterns, constraints and roles. */
export function compareEntries(a, b) {
  const tagsA = new Set(a.classification.activityTags), tagsB = new Set(b.classification.activityTags);
  const patternsB = new Set(b.patternIds);
  const roles = entry => [...new Set((entry.process?.steps || []).map(s => s.role).filter(Boolean))];
  return {
    sharedActivityTags: [...tagsA].filter(t => tagsB.has(t)),
    onlyA: [...tagsA].filter(t => !tagsB.has(t)),
    onlyB: [...tagsB].filter(t => !tagsA.has(t)),
    sharedPatternIds: a.patternIds.filter(id => patternsB.has(id)),
    constraintsA: a.context.constraints,
    constraintsB: b.context.constraints,
    rolesA: roles(a),
    rolesB: roles(b)
  };
}

/** Questions to ask before reusing anything from these entries. */
export function questionsBeforeReuse(entries, patterns) {
  const out = [];
  for (const p of patterns) for (const q of p.pattern?.questionsBeforeReuse || []) out.push({source: p.id, text: q});
  for (const e of entries) for (const q of e.openQuestions || []) out.push({source: e.id, text: q});
  return out;
}

/** Rank published entries against a personal draft classification. Deterministic tag overlap. */
export function relatedForDraft(classification, entries) {
  const tags = new Set(classification?.activityTags || []);
  const frictions = new Set(classification?.frictionTags || []);
  return entries
    .map(entry => {
      const sharedActivity = entry.classification.activityTags.filter(t => tags.has(t));
      const sharedFriction = entry.classification.frictionTags.filter(t => frictions.has(t));
      const sameFamily = !!classification?.familyId && classification.familyId === entry.classification.familyId;
      return {entry, sharedActivity, sharedFriction, sameFamily, score: sharedActivity.length * 2 + sharedFriction.length + (sameFamily ? 1 : 0)};
    })
    .filter(r => r.score > 0)
    .sort((x, y) => y.score - x.score || x.entry.title.localeCompare(y.entry.title, 'de'));
}

/**
 * Offline classification suggestion: keyword rule over title, step labels and the user's own friction text.
 * Returns evidence for each suggestion so the person can judge it.
 */
export function suggestClassification(process, taxonomy, reported = {}) {
  const sources = [
    {ref: 'title', text: process.title},
    ...process.steps.map(s => ({ref: s.id, text: s.label + ' ' + (s.note || '')}))
  ];
  const match = (tag, list) => {
    const evidence = [];
    for (const source of list) {
      const text = fold(source.text);
      const keyword = tag.keywords.find(k => text.includes(fold(k)));
      if (keyword) evidence.push({ref: source.ref, keyword});
    }
    return evidence;
  };
  const activityTags = taxonomy.activityTags.map(tag => ({id: tag.id, evidence: match(tag, sources)})).filter(t => t.evidence.length);
  const frictionSources = [...sources, {ref: 'pain', text: process.pain}];
  const frictionTags = taxonomy.frictionTags.map(tag => ({id: tag.id, evidence: match(tag, frictionSources)})).filter(t => t.evidence.length);
  if (reported.duplicateEntry === 'yes' && !frictionTags.some(t => t.id === 'duplicate-entry')) frictionTags.push({id: 'duplicate-entry', evidence: [{ref: 'reported', keyword: 'Selbstauskunft'}]});
  return {source: 'keyword-rule', activityTags, frictionTags};
}
