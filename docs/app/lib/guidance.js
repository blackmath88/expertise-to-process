// Guided capture without AI: one explicit question at a time, each answer becomes a previewed
// proposal that the person accepts, edits or rejects. Accepted proposals are undoable.
import {normalize} from '../model.js';

export const PROCESS_FIELDS = {title: 'Prozessname', owner: 'Verantwortung', trigger: 'Auslöser', outcome: 'Ergebnis', pain: 'Reibung', frequency: 'Häufigkeit'};
export const REPORTED_FIELDS = {duplicateEntry: 'Doppelte Erfassung', noExceptions: 'Läuft ohne Ausnahmen'};
const ANSWER = {yes: 'Ja', no: 'Nein', unknown: 'Weiss nicht'};
const clone = value => JSON.parse(JSON.stringify(value));

export function blankExtras() {
  return {narrative: '', reported: {duplicateEntry: 'unknown', noExceptions: 'unknown'}, classification: {familyId: '', activityTags: [], frictionTags: []}};
}

export function newStepId(process, reserved = []) {
  const used = new Set([...process.steps.map(s => s.id), ...reserved]);
  let n = 1;
  while (used.has('s' + n)) n++;
  return 's' + n;
}

const stepRef = (process, id) => {
  if (id === 'end') return 'Ende';
  const i = process.steps.findIndex(s => s.id === id);
  return i < 0 ? id : `Schritt ${i + 1} «${process.steps[i].label || 'ohne Bezeichnung'}»`;
};

/** A proposal is a list of operations plus where it came from. It never applies itself. */
export function createProposal(ops, {label, source = 'guided'} = {}) {
  return {id: 'p' + Math.random().toString(36).slice(2, 10), label: label || 'Änderung', source, ops: clone(ops)};
}

/** Mutates `draft` with one operation. Returns the IDs of steps whose connection changed. */
function applyOp(draft, op) {
  const p = draft.process;
  if (op.op === 'set') {
    if (!(op.field in PROCESS_FIELDS)) throw Error('Unbekanntes Feld.');
    p[op.field] = op.value;
  } else if (op.op === 'setReported') {
    if (!(op.field in REPORTED_FIELDS) || !(op.value in ANSWER)) throw Error('Ungültige Angabe.');
    draft.reported[op.field] = op.value;
  } else if (op.op === 'setStep') {
    const s = p.steps.find(x => x.id === op.id);
    if (!s || !['label', 'role'].includes(op.field)) throw Error('Schritt nicht gefunden.');
    s[op.field] = op.value;
  } else if (op.op === 'addStep') {
    if (p.steps.length >= 15) throw Error('Maximal 15 Schritte. Teile grössere Prozesse auf.');
    if (p.steps.some(s => s.id === op.step.id)) throw Error('Schritt-ID existiert bereits.');
    // The new step continues the main path: tasks ending the process and "Ja" branches to the end
    // now lead to it. "Nein → Ende" stays, because it usually means a deliberate exit.
    const redirected = [];
    for (const s of p.steps) {
      if (s.type === 'task' && s.next === 'end') { s.next = op.step.id; redirected.push(s.id); }
      if (s.type === 'decision' && s.yes === 'end') { s.yes = op.step.id; s.next = op.step.id; redirected.push(s.id); }
    }
    p.steps.push({id: op.step.id, type: 'task', label: op.step.label, role: op.step.role || '', system: op.step.system || '', note: op.step.note || '', next: 'end'});
    return redirected;
  } else if (op.op === 'insertDecision') {
    const index = p.steps.findIndex(s => s.id === op.afterId);
    const before = p.steps[index];
    if (!before || before.type !== 'task') throw Error('Eine Entscheidung wird nach einer Tätigkeit eingefügt.');
    if (p.steps.length + (op.rework ? 2 : 1) > 15) throw Error('Maximal 15 Schritte. Teile grössere Prozesse auf.');
    const continueTo = before.next;
    const decision = {id: op.step.id, type: 'decision', label: op.step.label, role: op.step.role || '', system: '', note: '', next: continueTo, yes: continueTo, no: op.noTarget || 'end'};
    before.next = decision.id;
    const added = [decision];
    if (op.rework) {
      decision.no = op.rework.id;
      added.push({id: op.rework.id, type: 'task', label: op.rework.label, role: op.rework.role || '', system: '', note: 'Rückweg', next: op.rework.returnTo || decision.id});
    }
    p.steps.splice(index + 1, 0, ...added);
    return [before.id];
  } else if (op.op === 'setClassification') {
    const c = draft.classification;
    if (op.familyId) c.familyId = op.familyId;
    c.activityTags = [...new Set([...c.activityTags, ...(op.activityTags || [])])];
    c.frictionTags = [...new Set([...c.frictionTags, ...(op.frictionTags || [])])];
  } else throw Error('Unbekannte Operation.');
  return [];
}

/**
 * Human-readable preview lines, computed by simulating the operations on a copy.
 * `edit` lists the values the person may change before accepting. `error` is set if the proposal cannot apply.
 */
export function previewProposal(draft, proposal) {
  const sim = clone(draft);
  const lines = [];
  try {
    proposal.ops.forEach((op, i) => {
      const p = sim.process;
      let line;
      if (op.op === 'set') line = {text: `${PROCESS_FIELDS[op.field]}: «${p[op.field] || 'leer'}» → «${op.value}»`, edit: [{key: `${i}.value`, label: PROCESS_FIELDS[op.field], value: op.value, multiline: op.field === 'pain'}]};
      else if (op.op === 'setReported') line = {text: `${REPORTED_FIELDS[op.field]} (Selbstauskunft): ${ANSWER[sim.reported[op.field]] || 'offen'} → ${ANSWER[op.value]}`, edit: []};
      else if (op.op === 'setStep') line = {text: `${stepRef(p, op.id)} · ${op.field === 'role' ? 'Rolle' : 'Bezeichnung'} → «${op.value}»`, edit: [{key: `${i}.value`, label: op.field === 'role' ? 'Rolle' : 'Bezeichnung', value: op.value}]};
      else if (op.op === 'insertDecision') {
        const noText = op.rework ? `neuer Schritt «${op.rework.label}» (${op.rework.role || 'Rolle offen'}), danach zurück zu ${op.rework.returnTo === op.step.id ? 'dieser Entscheidung' : stepRef(p, op.rework.returnTo)}` : stepRef(p, op.noTarget || 'end');
        const before = p.steps.find(s => s.id === op.afterId);
        const edit = [{key: `${i}.step.label`, label: 'Entscheidungsfrage', value: op.step.label}, {key: `${i}.step.role`, label: 'Wer entscheidet?', value: op.step.role}];
        if (op.rework) edit.push({key: `${i}.rework.label`, label: 'Tätigkeit bei Nein', value: op.rework.label}, {key: `${i}.rework.role`, label: 'Rolle bei Nein', value: op.rework.role});
        line = {text: `Neue Entscheidung nach ${stepRef(p, op.afterId)}: «${op.step.label}» · ${op.step.role || 'Rolle offen'}. Ja → ${stepRef(p, before?.next ?? 'end')}. Nein → ${noText}.`, edit};
      } else if (op.op === 'setClassification') line = {text: `Einordnung ergänzen: ${(op.activityTags || []).length} Tätigkeits-Tags und ${(op.frictionTags || []).length} Reibungs-Tags${op.familyId ? ', Familie ' + op.familyId : ''}.`, edit: []};
      const redirected = applyOp(sim, op);
      if (op.op === 'addStep') {
        const n = sim.process.steps.length;
        const from = redirected.map(id => stepRef(sim.process, id));
        line = {text: `Neuer Schritt ${n}: «${op.step.label}» · ${op.step.role || 'Rolle offen'}${op.step.system ? ' · ' + op.step.system : ''}. ${from.length ? 'Weiter von ' + from.join(' und ') + '; ' : ''}danach Ende.`, edit: [{key: `${i}.step.label`, label: 'Tätigkeit', value: op.step.label}, {key: `${i}.step.role`, label: 'Rolle', value: op.step.role}]};
      }
      lines.push(line);
    });
    normalize(sim.process);
    return {lines, error: null};
  } catch (error) {
    return {lines, error: error.message};
  }
}

/** Return a copy of the proposal with edited values (keys from previewProposal). */
export function editProposal(proposal, values) {
  const next = clone(proposal);
  for (const [key, value] of Object.entries(values)) {
    const [index, ...path] = key.split('.');
    let target = next.ops[Number(index)];
    if (!target || !path.length) continue;
    for (const part of path.slice(0, -1)) target = target?.[part];
    if (target && typeof value === 'string' && typeof target[path.at(-1)] === 'string') target[path.at(-1)] = value.trim().slice(0, path.at(-1) === 'value' ? 4000 : 160);
  }
  return next;
}

/** Apply a proposal to a copy of the draft. Throws (the original stays untouched) if the result is not a valid v1 process. */
export function applyProposal(draft, proposal) {
  const next = clone(draft);
  for (const op of proposal.ops) applyOp(next, op);
  next.process = normalize(next.process);
  return next;
}

/** Undo history of accepted changes. Snapshots are serialized so later edits cannot mutate them. */
export function createHistory(limit = 25) {
  const entries = [];
  return {
    push(label, before, after) { entries.push({label, before: JSON.stringify(before), after: JSON.stringify(after)}); if (entries.length > limit) entries.shift(); },
    peek() { return entries.at(-1) || null; },
    /** Returns the previous draft, and whether the current draft differs from what was accepted. */
    undo(current) {
      const entry = entries.pop();
      if (!entry) return null;
      return {label: entry.label, draft: JSON.parse(entry.before), changedSince: JSON.stringify(current) !== entry.after};
    },
    clear() { entries.length = 0; },
    get size() { return entries.length; }
  };
}

// ---- Guided questions -------------------------------------------------------------------------

/**
 * The next useful question for this draft. `state` remembers skipped questions and whether the
 * person said there are no further steps. Returns null when the basic description is complete.
 */
export function nextQuestion(draft, state = {}) {
  const p = draft.process, skipped = new Set(state.skipped || []);
  const open = id => !skipped.has(id);
  const empty = v => !String(v || '').trim();
  if (open('title') && (empty(p.title) || p.title === 'Mein Prozess')) return {id: 'title', concept: null, prompt: 'Welchen Vorgang möchtest du beschreiben?', help: 'Wähle einen überschaubaren Vorgang, den du gut kennst. Grössere Abläufe teilen wir später auf.', kind: 'text', field: 'title', placeholder: 'Zum Beispiel: Spesen abrechnen'};
  if (open('trigger') && empty(p.trigger)) return {id: 'trigger', concept: 'trigger', prompt: 'Was löst den Vorgang aus?', help: 'Ein Auslöser ist ein Ereignis, kein Tun: «Antrag ist eingegangen» statt «Antrag prüfen».', kind: 'text', field: 'trigger', placeholder: 'Zum Beispiel: Dienstreise ist abgeschlossen'};
  if (open('outcome') && empty(p.outcome)) return {id: 'outcome', concept: 'outcome', prompt: 'Woran erkennst du, dass der Vorgang abgeschlossen ist?', help: 'Das Ergebnis ist ein Zustand am Ende: «Betrag ist erfasst». Es begrenzt den Prozess.', kind: 'text', field: 'outcome', placeholder: 'Zum Beispiel: Betrag ist zur Auszahlung erfasst'};
  if (open('owner') && empty(p.owner)) return {id: 'owner', concept: 'role', prompt: 'Wer verantwortet den Vorgang als Ganzes?', help: 'Nenne eine Rolle oder ein Team, keine Privatperson. «Noch offen» ist eine ehrliche Antwort.', kind: 'text', field: 'owner', placeholder: 'Zum Beispiel: Sekretariat'};
  if (open('steps') && !state.stepsDone && p.steps.length < 15) return {id: 'steps', concept: 'activity', prompt: p.steps.length ? `Was passiert nach «${p.steps.at(-1).label || 'dem letzten Schritt'}»?` : 'Was passiert als Erstes?', help: 'Eine Tätigkeit pro Schritt: Verb und Gegenstand. Dazu die Rolle, die sie ausführt.', kind: 'step', canFinish: p.steps.length > 0};
  const tasks = p.steps.filter(s => s.type === 'task');
  if (open('decision') && tasks.length && !p.steps.some(s => s.type === 'decision') && draft.reported.noExceptions === 'unknown') return {id: 'decision', concept: 'decision', prompt: 'Wird irgendwo geprüft oder entschieden, sodass es unterschiedlich weitergeht?', help: 'Eine Entscheidung ist eine Frage mit mehreren Ausgängen, z. B. «Belege vollständig?». Die Prüfung davor ist eine Tätigkeit.', kind: 'decision', afterOptions: tasks.map(s => s.id)};
  if (open('duplicate') && draft.reported.duplicateEntry === 'unknown') return {id: 'duplicate', concept: 'handover', prompt: 'Werden dieselben Angaben mehrfach erfasst oder von einem System ins andere übertragen?', help: 'Das ist eine Selbstauskunft. Sie hilft, Medienbrüche zu erkennen, ist aber noch keine Messung.', kind: 'choice', field: 'duplicateEntry'};
  if (open('frequency') && empty(p.frequency)) return {id: 'frequency', concept: null, prompt: 'Wie häufig kommt der Vorgang vor?', help: 'Eine grobe Angabe genügt. Schreib dazu, ob geschätzt oder gezählt.', kind: 'text', field: 'frequency', placeholder: 'Zum Beispiel: etwa 20-mal pro Monat, geschätzt'};
  if (open('pain') && empty(p.pain)) return {id: 'pain', concept: 'exception', prompt: 'Wo wird es mühsam?', help: 'Rückfragen, Wartezeiten, doppelte Arbeit oder Ausnahmen. Deine Worte bleiben so stehen, wie du sie schreibst.', kind: 'text', field: 'pain', multiline: true, placeholder: 'Zum Beispiel: Belege fehlen oft und werden per E-Mail nachgefordert.'};
  return null;
}

/** Turn an answer to a guided question into a proposal. */
export function proposalForAnswer(draft, question, answer) {
  const p = draft.process;
  if (question.kind === 'text') {
    const value = String(answer.value || '').trim();
    if (!value) throw Error('Bitte eine Antwort eingeben oder die Frage überspringen.');
    return createProposal([{op: 'set', field: question.field, value: value.slice(0, question.field === 'pain' ? 4000 : 160)}], {label: PROCESS_FIELDS[question.field] + ' übernehmen'});
  }
  if (question.kind === 'choice') return createProposal([{op: 'setReported', field: question.field, value: answer.value}], {label: 'Selbstauskunft übernehmen'});
  if (question.kind === 'step') {
    const label = String(answer.label || '').trim();
    if (!label) throw Error('Bitte die Tätigkeit beschreiben.');
    return createProposal([{op: 'addStep', step: {id: newStepId(p), label: label.slice(0, 160), role: String(answer.role || '').trim().slice(0, 160), system: String(answer.system || '').trim().slice(0, 160)}}], {label: 'Schritt ergänzen'});
  }
  if (question.kind === 'decision') {
    if (answer.none) return createProposal([{op: 'setReported', field: 'noExceptions', value: 'yes'}], {label: 'Ohne Entscheidung festhalten'});
    const label = String(answer.label || '').trim();
    if (!label) throw Error('Bitte die Entscheidungsfrage formulieren.');
    const id = newStepId(p);
    const op = {op: 'insertDecision', afterId: answer.afterId, step: {id, label: label.slice(0, 160), role: String(answer.role || '').trim().slice(0, 160)}};
    if (answer.noTarget === 'rework') {
      const reworkLabel = String(answer.reworkLabel || '').trim();
      if (!reworkLabel) throw Error('Bitte beschreiben, was bei Nein getan wird.');
      op.rework = {id: newStepId(p, [id]), label: reworkLabel.slice(0, 160), role: String(answer.reworkRole || answer.role || '').trim().slice(0, 160), returnTo: answer.returnTo || answer.afterId};
    } else op.noTarget = answer.noTarget || 'end';
    return createProposal([op], {label: 'Entscheidung ergänzen'});
  }
  throw Error('Unbekannte Frage.');
}

// ---- Clearly labelled scripted example ----------------------------------------------------------

/**
 * A fixed script, not AI. Each turn shows the question, a prepared answer and the proposal it
 * produces. The person still accepts, edits or rejects each proposal.
 */
export const SCRIPT_TITLE = 'Vorbereitetes Drehbuch: Spesen nach einer Dienstreise abrechnen (fiktiv)';
export function scriptedTurns() {
  return [
    {question: 'Welchen Vorgang möchtest du beschreiben – und wo beginnt und endet er?', answer: 'Ich rechne Spesen nach einer Dienstreise ab. Los geht es, wenn die Reise vorbei ist; fertig ist es, wenn die Finanzabteilung den Betrag erfasst hat. Verantwortlich ist das Sekretariat.',
      ops: [{op: 'set', field: 'title', value: 'Spesen nach einer Dienstreise abrechnen'}, {op: 'set', field: 'trigger', value: 'Dienstreise ist abgeschlossen'}, {op: 'set', field: 'outcome', value: 'Betrag ist zur Auszahlung erfasst'}, {op: 'set', field: 'owner', value: 'Sekretariat'}], label: 'Rahmen des Prozesses'},
    {question: 'Was passiert als Erstes?', answer: 'Ich sammle die Belege und reiche das Formular beim Sekretariat ein.',
      ops: [{op: 'addStep', step: {id: 's1', label: 'Belege sammeln', role: 'Reisende Person', system: ''}}, {op: 'addStep', step: {id: 's2', label: 'Abrechnung einreichen', role: 'Reisende Person', system: 'PDF-Formular'}}], label: 'Erste Schritte'},
    {question: 'Wird irgendwo geprüft oder entschieden?', answer: 'Das Sekretariat schaut, ob alle Belege da sind. Wenn nicht, fordert es sie nach und ich reiche nochmals ein.',
      ops: [{op: 'insertDecision', afterId: 's2', step: {id: 's3', label: 'Belege vollständig?', role: 'Sekretariat'}, rework: {id: 's4', label: 'Fehlende Belege nachfordern', role: 'Sekretariat', returnTo: 's2'}}], label: 'Prüfung mit Rückweg'},
    {question: 'Und wenn alles vollständig ist?', answer: 'Dann visiert meine vorgesetzte Person, und die Finanzabteilung erfasst den Betrag.',
      ops: [{op: 'addStep', step: {id: 's5', label: 'Abrechnung visieren', role: 'Vorgesetzte Person', system: ''}}, {op: 'addStep', step: {id: 's6', label: 'Betrag im Finanzsystem erfassen', role: 'Finanzabteilung', system: 'Finanzsystem'}}], label: 'Weitere Schritte'},
    {question: 'Wo wird es mühsam, und wie oft kommt das vor?', answer: 'Belege fehlen oft. Und die Beträge werden aus dem PDF ins Finanzsystem abgetippt. Vielleicht 20-mal im Monat, gezählt habe ich nie.',
      ops: [{op: 'set', field: 'pain', value: 'Belege fehlen oft und werden per E-Mail nachgefordert. Die Beträge werden aus dem PDF-Formular ins Finanzsystem abgetippt.'}, {op: 'set', field: 'frequency', value: 'Geschätzt 20-mal pro Monat; nicht gezählt'}, {op: 'setReported', field: 'duplicateEntry', value: 'yes'}], label: 'Reibung und Häufigkeit'}
  ];
}
