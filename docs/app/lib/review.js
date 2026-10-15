// Deterministic process check ("Prozess-Check"). No LLM: every finding is derived from model facts
// and cites the fields or step IDs it is based on. Unknown stays unknown; no savings are estimated.
import {issues, lenses, checks} from '../model.js';

const VAGUE = /^(offen|noch zu klären|unklar|unbekannt|\?|-|—|tbd|keine ahnung)$/i;
const blank = v => !String(v || '').trim();
const vague = v => blank(v) || VAGUE.test(String(v).trim());
const DUPLICATE_HINT = /(übertrag|doppelt|abtipp|erneut ein|nochmals ein|mehrfach (ein|erfass))/i;

export const stepNumber = (process, id) => process.steps.findIndex(s => s.id === id) + 1;
const stepName = (process, id) => id === 'end' ? 'Ende' : `Schritt ${stepNumber(process, id)} «${process.steps.find(s => s.id === id)?.label || 'ohne Bezeichnung'}»`;
const targetsOf = s => s.type === 'decision' ? [['Ja', s.yes], ['Nein', s.no]] : [['', s.next]];

/** Back edges: an edge that points to a step at the same or an earlier position. */
export function findLoops(process) {
  const index = new Map(process.steps.map((s, i) => [s.id, i]));
  const loops = [];
  for (const s of process.steps) for (const [label, target] of targetsOf(s)) {
    if (target !== 'end' && index.has(target) && index.get(target) <= index.get(s.id)) loops.push({from: s.id, to: target, label});
  }
  return loops;
}

/** Role changes between connected steps. */
export function findHandovers(process) {
  const byId = new Map(process.steps.map(s => [s.id, s]));
  const out = [];
  for (const s of process.steps) for (const [, target] of targetsOf(s)) {
    const t = byId.get(target);
    if (t && s.role.trim() && t.role.trim() && s.role.trim() !== t.role.trim()) out.push({from: s.id, to: t.id, fromRole: s.role.trim(), toRole: t.role.trim()});
  }
  return out;
}

/** Meaningful completeness: which parts of a usable description are present. Not a score. */
export function completeness(process, extras = {}) {
  const items = [
    {id: 'trigger', label: 'Auslöser beschrieben', done: !vague(process.trigger)},
    {id: 'outcome', label: 'Ergebnis beschrieben', done: !vague(process.outcome)},
    {id: 'owner', label: 'Verantwortung benannt', done: !vague(process.owner)},
    {id: 'steps', label: 'Mindestens zwei Schritte', done: process.steps.length >= 2},
    {id: 'roles', label: 'Jeder Schritt hat eine Rolle', done: process.steps.length > 0 && process.steps.every(s => !blank(s.role))},
    {id: 'decision', label: 'Entscheidungen oder Ausnahmen geklärt', done: process.steps.some(s => s.type === 'decision') || extras.reported?.noExceptions === 'yes'},
    {id: 'friction', label: 'Reibung oder Anlass beschrieben', done: !blank(process.pain)},
    {id: 'structure', label: 'Jeder Weg führt zum Ende', done: process.steps.length > 0 && issues(process).length === 0}
  ];
  return {items, done: items.filter(i => i.done).length, total: items.length};
}

/**
 * Build the sparring report.
 * @returns {{facts: Finding[], questions: Finding[], hypotheses: Finding[]}}
 * Finding = {id, title, detail, refs: [{kind:'field'|'step', id, label}]}
 */
export function reviewProcess(process, extras = {}) {
  const reported = extras.reported || {};
  const facts = [], questions = [], hypotheses = [];
  const field = (id, label) => ({kind: 'field', id, label});
  const step = id => ({kind: 'step', id, label: stepName(process, id)});

  // Reported facts: only what the person entered.
  if (!vague(process.trigger)) facts.push({id: 'fact-trigger', title: 'Auslöser', detail: process.trigger, refs: [field('trigger', 'Auslöser')]});
  if (!vague(process.outcome)) facts.push({id: 'fact-outcome', title: 'Ergebnis', detail: process.outcome, refs: [field('outcome', 'Ergebnis')]});
  if (!vague(process.owner)) facts.push({id: 'fact-owner', title: 'Verantwortung', detail: process.owner, refs: [field('owner', 'Verantwortung')]});
  const roles = [...new Set(process.steps.map(s => s.role.trim()).filter(Boolean))];
  if (process.steps.length) facts.push({id: 'fact-steps', title: `${process.steps.length} Schritte, ${roles.length} Rollen`, detail: roles.length ? 'Beteiligte Rollen: ' + roles.join(', ') : 'Noch keine Rollen erfasst.', refs: process.steps.map(s => step(s.id))});
  for (const s of process.steps.filter(s => s.type === 'decision')) facts.push({id: 'fact-decision-' + s.id, title: 'Entscheidung', detail: `«${s.label}» – Ja führt zu ${stepName(process, s.yes)}, Nein zu ${stepName(process, s.no)}.`, refs: [step(s.id)]});
  const loops = findLoops(process);
  for (const loop of loops) facts.push({id: `fact-loop-${loop.from}-${loop.to}`, title: 'Rückweg im Ablauf', detail: `Von ${stepName(process, loop.from)}${loop.label ? ' (' + loop.label + ')' : ''} zurück zu ${stepName(process, loop.to)}.`, refs: [step(loop.from), step(loop.to)]});
  const handovers = findHandovers(process);
  if (handovers.length) facts.push({id: 'fact-handovers', title: `${handovers.length} Übergaben zwischen Rollen`, detail: handovers.map(h => `${h.fromRole} → ${h.toRole} (Schritt ${stepNumber(process, h.from)} → ${stepNumber(process, h.to)})`).join('; ') + '.', refs: handovers.map(h => step(h.to))});
  if (!blank(process.pain)) facts.push({id: 'fact-pain', title: 'Gemeldete Reibung (Selbstauskunft)', detail: process.pain, refs: [field('pain', 'Reibung')]});
  if (!blank(process.frequency)) facts.push({id: 'fact-frequency', title: 'Häufigkeit (Angabe)', detail: process.frequency, refs: [field('frequency', 'Häufigkeit')]});
  if (reported.duplicateEntry === 'yes') facts.push({id: 'fact-duplicate', title: 'Doppelte Erfassung gemeldet', detail: 'Du hast angegeben, dass dieselben Angaben mehrfach erfasst oder übertragen werden.', refs: [field('reported.duplicateEntry', 'Selbstauskunft')]});

  // Unanswered questions: gaps, ambiguities and structure problems.
  if (vague(process.trigger)) questions.push({id: 'q-trigger', title: 'Was löst den Prozess aus?', detail: 'Ohne klaren Auslöser ist unklar, wann der Prozess beginnt. Ein Auslöser ist ein Ereignis («Vertrag ist unterschrieben»), keine Tätigkeit.', refs: [field('trigger', 'Auslöser')]});
  if (vague(process.outcome)) questions.push({id: 'q-outcome', title: 'Woran erkennt man, dass der Prozess fertig ist?', detail: 'Ein klares Ergebnis grenzt den Prozess ab und macht Verbesserungen überprüfbar.', refs: [field('outcome', 'Ergebnis')]});
  if (vague(process.owner)) questions.push({id: 'q-owner', title: 'Wer verantwortet den Prozess als Ganzes?', detail: process.owner.trim() ? `Die Angabe «${process.owner}» ist noch offen. Ohne Verantwortung bleibt unklar, wer Änderungen entscheidet.` : 'Noch keine verantwortliche Rolle angegeben.', refs: [field('owner', 'Verantwortung')]});
  for (const s of process.steps) {
    if (blank(s.role)) questions.push({id: 'q-role-' + s.id, title: `Wer macht ${stepName(process, s.id)}?`, detail: 'Ohne Rolle lässt sich nicht erkennen, wo Übergaben entstehen.', refs: [step(s.id)]});
    if (blank(s.label)) questions.push({id: 'q-label-' + s.id, title: `Was geschieht in Schritt ${stepNumber(process, s.id)}?`, detail: 'Beschreibe die Tätigkeit mit Verb und Gegenstand.', refs: [step(s.id)]});
    if (s.type === 'decision' && s.yes === s.no) questions.push({id: 'q-branch-' + s.id, title: `Führen beide Antworten bei ${stepName(process, s.id)} wirklich zum gleichen Schritt?`, detail: 'Wenn Ja und Nein gleich weitergehen, ist es vielleicht keine Entscheidung, sondern eine Prüftätigkeit.', refs: [step(s.id)]});
  }
  for (const loop of loops) questions.push({id: `q-loop-${loop.from}-${loop.to}`, title: 'Ist dieser Rückweg nötig – und wie oft kommt er vor?', detail: `Ein Rückweg ist nicht automatisch Verschwendung. Manche Schleifen sichern Qualität. Kläre, warum ${stepName(process, loop.from)} zurück zu ${stepName(process, loop.to)} führt und wie häufig das geschieht.`, refs: [step(loop.from), step(loop.to)]});
  if (handovers.length) questions.push({id: 'q-handover', title: 'Ist bei jeder Übergabe klar, was übergeben wird?', detail: `${handovers.length} Rollenwechsel im Ablauf. Prüfe, ob die übernehmende Rolle weiss, dass sie übernehmen soll.`, refs: handovers.map(h => step(h.to))});
  if (process.steps.length && !process.steps.some(s => s.type === 'decision') && reported.noExceptions !== 'yes') questions.push({id: 'q-exceptions', title: 'Gibt es Ausnahmen oder Prüfungen?', detail: 'Der Ablauf enthält keine Entscheidung. Läuft er wirklich immer gleich, oder gibt es Fälle, die anders behandelt werden?', refs: [field('steps', 'Ablauf')]});
  if (blank(process.frequency)) questions.push({id: 'q-frequency', title: 'Wie häufig kommt der Prozess vor?', detail: 'Unbekannt. Ohne Häufigkeit lässt sich der Nutzen einer Änderung nicht abschätzen; eine grobe Zählung genügt für den Anfang.', refs: [field('frequency', 'Häufigkeit')]});
  if (reported.duplicateEntry === 'unknown' || reported.duplicateEntry === undefined) questions.push({id: 'q-duplicate', title: 'Werden dieselben Angaben mehrfach erfasst?', detail: 'Noch nicht beantwortet. Diese Frage hilft, Medienbrüche zu erkennen.', refs: [field('reported.duplicateEntry', 'Selbstauskunft')]});
  issues(process).forEach((problem, i) => questions.push({id: 'q-structure-' + i, title: 'Struktur prüfen', detail: problem, refs: [field('steps', 'Ablauf')]}));
  if (process.checks?.validated !== 'yes' && process.steps.length) questions.push({id: 'q-validated', title: 'Haben die Beteiligten den Ablauf bestätigt?', detail: 'Die Karte beschreibt deine Sicht. Lass sie von den beteiligten Rollen prüfen, bevor du Verbesserungen ableitest.', refs: [field('checks.validated', 'Prüfstand')]});

  // Improvement hypotheses: only where the model provides a concrete reason.
  // A completeness check whose "Nein" branch leads into a loop: criteria may be unknown to submitters.
  for (const d of process.steps.filter(s => s.type === 'decision' && /vollständig|komplett|korrekt/i.test(s.label))) {
    if (!loops.some(l => l.from === d.id || l.to === d.id || l.from === d.no)) continue;
    hypotheses.push({id: 'h-criteria-' + d.id, title: 'Kriterien früher sichtbar machen', detail: `Die Prüfung «${d.label}» führt bei Nein in einen Rückweg. Hypothese: Wenn die Kriterien den Einreichenden vorab bekannt sind, gibt es weniger Rückwege. Prüfen: Rückwege während einer Periode zählen, vorher und nachher. Ob der Rückweg fachlich nötig ist, bleibt zu klären.`, refs: [step(d.id), ...(d.no !== 'end' ? [step(d.no)] : [])], pattern: 'completeness-check'});
  }
  if (reported.duplicateEntry === 'yes' || DUPLICATE_HINT.test(process.pain)) hypotheses.push({id: 'h-duplicate', title: 'Angaben nur einmal erfassen', detail: 'Du hast doppelte Erfassung oder Übertragen beschrieben. Hypothese: Eine gemeinsame Quelle oder Vorlage vermeidet erneutes Abtippen. Prüfen: Wo genau wird übertragen, und wer braucht welche Angaben?', refs: [reported.duplicateEntry === 'yes' ? field('reported.duplicateEntry', 'Selbstauskunft') : field('pain', 'Reibung')]});
  if (vague(process.owner) && handovers.length) hypotheses.push({id: 'h-owner', title: 'Verantwortung klären, bevor Abläufe geändert werden', detail: 'Mehrere Rollen sind beteiligt, aber niemand verantwortet den Prozess als Ganzes. Hypothese: Eine benannte Verantwortung erleichtert Entscheidungen über Änderungen.', refs: [field('owner', 'Verantwortung')], pattern: 'explicit-handover'});
  if (!blank(process.opportunity?.hypothesis)) hypotheses.push({id: 'h-own', title: 'Deine eigene Hypothese', detail: process.opportunity.hypothesis + (blank(process.opportunity.measure) ? ' – Woran würdest du die Verbesserung erkennen? Noch offen.' : ` – Messung: ${process.opportunity.measure}`), refs: [field('opportunity.hypothesis', 'Hypothese')]});

  return {facts, questions, hypotheses};
}

export function reportMarkdown(process, review, extras = {}) {
  const refs = f => f.refs.length ? ` _(Bezug: ${f.refs.map(r => r.kind === 'step' ? r.id : r.label).join(', ')})_` : '';
  const list = (items, empty) => items.length ? items.map(f => `- **${f.title}:** ${f.detail}${refs(f)}`).join('\n') : `- ${empty}`;
  const c = completeness(process, extras);
  return `# Prozess-Check: ${process.title}

Erstellt offline durch feste Regeln, ohne KI. Keine Freigabe, keine Bewertung von Regelkonformität, keine geschätzten Einsparungen.
Perspektive: ${lenses[process.lens]}

## Beschreibungsstand
${c.items.map(i => `- [${i.done ? 'x' : ' '}] ${i.label}`).join('\n')}

## Gemeldete Fakten
${list(review.facts, 'Noch keine Angaben.')}

## Offene Fragen
${list(review.questions, 'Keine offenen Fragen aus den Regeln. Prüft den Ablauf trotzdem mit den Beteiligten.')}

## Verbesserungshypothesen (ungeprüft)
${list(review.hypotheses, 'Noch keine begründete Hypothese.')}

## Prüfstand (Selbstauskunft)
${checks.map(([k, label]) => `- ${label}: ${{yes: 'Ja', no: 'Nein', unknown: 'Offen'}[process.checks[k]]}`).join('\n')}

Schritt-IDs beziehen sich auf die gleichzeitig exportierte Prozessdatei.
`;
}
