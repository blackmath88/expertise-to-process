// Contribution preparation: a separate, reduced copy of the personal draft, wrapped in a
// pending-review envelope and downloaded as files. No network write; no publication claim.
import {mermaid} from '../model.js';
import {validateEntry, labelFor} from './library.js';

export const ENVELOPE_KEYS = ['schemaVersion', 'kind', 'contributionId', 'createdAt', 'status', 'candidateEntry', 'openQuestions', 'narrative', 'sharingConfirmation'];
export const SHARING_STATEMENT = 'Ich möchte diese Beschreibung zur fachlichen Prüfung weitergeben. Ich habe die Vorschau geprüft und nur Angaben belassen, die ich weitergeben darf.';
export const SHARING_LIMIT = 'Diese Bestätigung ist keine Freigabe zur Veröffentlichung. Über die Aufnahme entscheiden fachliche Prüfung und Kuration.';

export const REDACTIONS = {
  removeNarrative: 'Freie Erzählung weglassen',
  removePain: 'Beschreibung der Reibung weglassen',
  removeNotes: 'Hinweise zu Schritten weglassen',
  removeSystems: 'Systeme und Werkzeuge weglassen',
  removeOwner: 'Verantwortliche Stelle weglassen',
  removeFrequency: 'Häufigkeit weglassen',
  removeHypothesis: 'Verbesserungshypothese weglassen'
};
export const DEFAULT_OPTIONS = {removeNarrative: true, removePain: false, removeNotes: false, removeSystems: false, removeOwner: false, removeFrequency: false, removeHypothesis: false};

const clone = v => JSON.parse(JSON.stringify(v));
export function slugify(text) {
  const map = {ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', é: 'e', è: 'e', à: 'a'};
  const slug = String(text || '').toLowerCase().replace(/[äöüßéèà]/g, c => map[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return slug || 'beitrag';
}
const lines = text => String(text || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30).map(s => s.slice(0, 600));

/**
 * Build the candidate library entry from a draft. The draft itself is never modified.
 * @param draft {process, narrative, reported, classification}
 * @param form {title, summary, scope, constraints, openQuestions, fictional, familyId, activityTags, frictionTags, patternIds, ...REDACTIONS}
 */
export function buildCandidate(draft, form = {}) {
  const o = {...DEFAULT_OPTIONS, ...form};
  const process = clone(draft.process);
  if (o.removePain) process.pain = '';
  if (o.removeOwner) process.owner = '';
  if (o.removeFrequency) process.frequency = '';
  if (o.removeHypothesis) process.opportunity = {kind: process.opportunity.kind, hypothesis: '', measure: '', next: ''};
  for (const s of process.steps) { if (o.removeNotes) s.note = ''; if (o.removeSystems) s.system = ''; }
  const title = String(o.title ?? process.title).trim().slice(0, 160);
  process.title = title || process.title;
  const classification = {
    familyId: o.familyId ?? draft.classification.familyId,
    activityTags: [...(o.activityTags ?? draft.classification.activityTags)],
    frictionTags: [...(o.frictionTags ?? draft.classification.frictionTags)]
  };
  return {
    schemaVersion: 1,
    id: slugify(title),
    kind: process.opportunity.hypothesis.trim() && !o.removeHypothesis ? 'improvement-case' : 'process-example',
    title,
    summary: String(o.summary || '').trim().slice(0, 600),
    fictional: !!o.fictional,
    context: {scope: String(o.scope || '').trim().slice(0, 600), constraints: lines(o.constraints)},
    classification,
    provenance: {sourceType: 'contribution', sourceLabel: 'Beitrag aus der Prozesswerkbank; Inhalt noch nicht geprüft', sourceRefs: []},
    review: {status: 'pending-review', reviewedByRole: null, reviewedAt: null},
    effectiveness: {status: 'untested', evidenceRefs: []},
    authority: {status: 'none', scope: null, authoritySource: null},
    maintenance: {ownerRole: null, reviewDue: null},
    relatedIds: [],
    patternIds: [...(o.patternIds || [])],
    process
  };
}

export function newContributionId(now = new Date()) {
  const random = globalThis.crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);
  return `beitrag-${now.toISOString().slice(0, 10)}-${random}`;
}

/** Wrap the candidate. Only explicitly listed fields are included; tokens, settings and chats never are. */
export function buildEnvelope(draft, form = {}, {contributionId = newContributionId(), createdAt = new Date().toISOString(), confirmed = false} = {}) {
  const o = {...DEFAULT_OPTIONS, ...form};
  const envelope = {
    schemaVersion: 1,
    kind: 'pietro-contribution',
    contributionId,
    createdAt,
    status: 'pending-review',
    candidateEntry: buildCandidate(draft, o),
    openQuestions: lines(o.openQuestions)
  };
  if (!o.removeNarrative && String(draft.narrative || '').trim()) envelope.narrative = String(draft.narrative).slice(0, 8000);
  envelope.sharingConfirmation = {confirmed: !!confirmed, statement: SHARING_STATEMENT, limit: SHARING_LIMIT, confirmedAt: confirmed ? createdAt : null};
  return envelope;
}

export function validateContribution(envelope, taxonomy) {
  const errors = [];
  for (const key of Object.keys(envelope)) if (!ENVELOPE_KEYS.includes(key)) errors.push(`Unerwartetes Feld ${key}.`);
  if (envelope.schemaVersion !== 1 || envelope.kind !== 'pietro-contribution') errors.push('Unbekanntes Beitragsformat.');
  if (envelope.status !== 'pending-review') errors.push('Ein Beitrag beginnt immer mit «Prüfung ausstehend».');
  if (!/^beitrag-[\w-]+$/.test(envelope.contributionId || '')) errors.push('Beitrags-ID fehlt.');
  if (!envelope.sharingConfirmation?.confirmed) errors.push('Bitte bestätige, dass du diese Vorschau zur Prüfung weitergeben möchtest.');
  const entry = envelope.candidateEntry;
  if (entry?.review?.status !== 'pending-review') errors.push('Der Eintrag muss «Prüfung ausstehend» sein.');
  for (const message of validateEntry(entry, taxonomy)) errors.push(message.replace(/^[^:]+: /, ''));
  return errors;
}

export function contributionMarkdown(envelope, taxonomy) {
  const e = envelope.candidateEntry, p = e.process;
  const tag = (group, id) => labelFor(taxonomy, group, id);
  return `# Beitrag zur Prüfung: ${e.title}

Status: **Prüfung ausstehend** – nicht veröffentlicht, nicht freigegeben.
Beitrags-ID: ${envelope.contributionId}
Erstellt: ${envelope.createdAt}
${e.fictional ? 'Als fiktives Beispiel gekennzeichnet.\n' : ''}
## Weg in die Bibliothek
1. Datei herunterladen (erledigt).
2. Fachlich prüfen lassen: Beteiligte bestätigen den Ablauf für ihren Kontext.
3. Durch die Kuration aufnehmen: Eignung, Einordnung und Pflegeverantwortung klären.

## Zusammenfassung
${e.summary || '—'}

## Kontext
Geltungsbereich: ${e.context.scope || '—'}
${e.context.constraints.map(c => `- ${c}`).join('\n') || '- Keine lokalen Bedingungen angegeben.'}

## Einordnung (Vorschlag)
Familie: ${e.classification.familyId ? tag('families', e.classification.familyId) : 'offen'}
Tätigkeiten: ${e.classification.activityTags.map(t => tag('activityTags', t)).join(', ') || 'offen'}
Reibung: ${e.classification.frictionTags.map(t => tag('frictionTags', t)).join(', ') || 'offen'}

## Ablauf
Auslöser: ${p.trigger || 'offen'} · Ergebnis: ${p.outcome || 'offen'} · Verantwortung: ${p.owner || 'nicht angegeben'}

${p.steps.map((s, i) => `${i + 1}. ${s.label} – ${s.role || 'Rolle offen'}${s.system ? ' · ' + s.system : ''}${s.type === 'decision' ? ` (Entscheidung: Ja → ${s.yes}, Nein → ${s.no})` : ''}`).join('\n')}

\`\`\`mermaid
${mermaid(p)}
\`\`\`
${p.pain ? `\n## Reibung (Selbstauskunft)\n${p.pain}\n` : ''}${p.opportunity.hypothesis ? `\n## Verbesserungshypothese (ungeprüft)\n${p.opportunity.hypothesis}\n` : ''}
## Offene Fragen
${envelope.openQuestions.map(q => `- ${q}`).join('\n') || '- Keine angegeben.'}
${envelope.narrative ? `\n## Freie Erzählung (von der beitragenden Person belassen)\n${envelope.narrative}\n` : ''}
## Status der Angaben
- Fachliche Prüfung: ausstehend
- Wirkung: nicht getestet
- Verbindlichkeit: keine

> ${envelope.sharingConfirmation.statement}
> ${envelope.sharingConfirmation.limit}
`;
}

export function buildContributionFiles(envelope, taxonomy) {
  const base = envelope.contributionId;
  return [
    {name: `${base}.json`, type: 'application/json', content: JSON.stringify(envelope, null, 2)},
    {name: `${base}.md`, type: 'text/markdown', content: contributionMarkdown(envelope, taxonomy)}
  ];
}
