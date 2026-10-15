import {blank, lenses, checks, issues, mermaid, markdown, prompt} from './model.js';
import {h, replaceChildren} from './lib/dom.js';
import {esc, mapSvg, textAlternative} from './lib/map.js';
import {createStaticLibrary, createDraftStore, parseDraft, serializeProcessFile, exportContribution} from './lib/storage.js';
import {searchEntries, compareEntries, questionsBeforeReuse, relatedForDraft, labelFor, REVIEW_STATUS, EFFECTIVENESS_STATUS, AUTHORITY_STATUS} from './lib/library.js';
import {reviewProcess, completeness, reportMarkdown} from './lib/review.js';
import {blankExtras, createHistory, createProposal, previewProposal, editProposal, applyProposal, nextQuestion, proposalForAnswer, newStepId, scriptedTurns, SCRIPT_TITLE} from './lib/guidance.js';
import {createOfflineAdapter} from './lib/ai.js';
import {buildEnvelope, validateContribution, newContributionId, REDACTIONS, DEFAULT_OPTIONS, SHARING_STATEMENT, SHARING_LIMIT} from './lib/contribution.js';
import {exercises, glossary} from './lib/lessons.js';

const $ = id => document.getElementById(id);
const clone = v => JSON.parse(JSON.stringify(v));

// ---- State ---------------------------------------------------------------------------------------
const draftStore = createDraftStore();
const libraryStore = createStaticLibrary({baseUrl: new URL('./data/', document.baseURI)});
const history = createHistory();
let draft = {process: blank(), ...blankExtras()};
let origin = '';
let dirty = false, savedAt = null, storageProblem = '';
let mode = 'guided', guideState = {skipped: [], stepsDone: false};
let script = null;            // {turns, index}
let pending = null;           // {proposal, question, answerText, editing, values}
let tagPending = null;        // {proposal, suggestion}
let library = {status: 'loading', entries: [], taxonomy: null, error: ''};
let adapter = createOfflineAdapter();
let contrib = freshContribution();
let backend = '', token = '', chatHistory = [], busy = false, toastTimer;
let activeTab = 'ablauf', lessonContext = 'uni', lessonIndex = 0;

function freshContribution() { return {id: newContributionId(), createdAt: new Date().toISOString(), form: null, titleTouched: false, envelope: null}; }

function notify(message) {
  $('toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 6000);
}

const hasContent = d => d.process.steps.length > 0 || (d.process.title && d.process.title !== 'Mein Prozess') || ['trigger', 'outcome', 'owner', 'pain'].some(k => d.process[k].trim()) || d.narrative.trim();

// ---- Dialogs -------------------------------------------------------------------------------------
function ask(title, text, buttons) {
  return new Promise(resolve => {
    const dialog = $('confirmDialog');
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    replaceChildren($('confirmActions'), buttons.map(b => h('button', {type: 'button', class: b.primary ? 'primary' : '', onclick: () => { dialog.close(); resolve(b.value); }}, b.label)));
    dialog.onclose = () => resolve('cancel');
    dialog.showModal();
    $('confirmActions').querySelector('button')?.focus();
  });
}

/** Protect the current draft before it is replaced. Resolves true if replacing may proceed. */
async function confirmReplace(what) {
  if (!hasContent(draft)) return true;
  const choice = await ask('Aktuellen Entwurf ersetzen?', `${what} ersetzt deinen Entwurf «${draft.process.title}» in der Werkbank${dirty ? '. Er hat ungesicherte Änderungen' : ''}. Du kannst die Ersetzung danach mit «Rückgängig» zurücknehmen oder deinen Entwurf vorher als Datei sichern.`, [
    {label: 'Erst als Datei sichern, dann ersetzen', value: 'export'},
    {label: 'Ersetzen', value: 'replace', primary: true},
    {label: 'Abbrechen', value: 'cancel'}
  ]);
  if (choice === 'export') { exportJson(); return true; }
  return choice === 'replace';
}

// ---- Draft lifecycle -----------------------------------------------------------------------------
function commit(next, label, {record = true, newOrigin} = {}) {
  if (record) history.push(label, draft, next);
  draft = next;
  if (newOrigin !== undefined) origin = newOrigin;
  dirty = true;
  renderAll();
}
function touched() { dirty = true; refreshDerived(); renderStatus(); }

function renderStatus() {
  $('draftHeading').textContent = draft.process.title || 'Mein Prozess';
  const parts = [];
  if (origin) parts.push(origin);
  if (storageProblem) parts.push(storageProblem);
  else if (!dirty && savedAt) parts.push('Auf diesem Gerät gespeichert · ' + new Date(savedAt).toLocaleString('de-CH', {dateStyle: 'short', timeStyle: 'short'}));
  else parts.push(dirty ? 'Ungespeicherte Änderungen' : 'Nicht gespeichert');
  $('draftStatus').textContent = parts.join(' · ');
  const last = history.peek();
  $('undoBtn').disabled = !last;
  $('undoBtn').textContent = last ? `Rückgängig: ${last.label}` : 'Rückgängig';
}

$('undoBtn').onclick = async () => {
  const last = history.peek();
  if (!last) return;
  if (last.after !== JSON.stringify(draft)) {
    const choice = await ask('Rückgängig machen?', `Seit «${last.label}» hast du weiter bearbeitet. Beim Rückgängigmachen gehen diese späteren Änderungen verloren.`, [{label: 'Trotzdem rückgängig', value: 'undo', primary: true}, {label: 'Abbrechen', value: 'cancel'}]);
    if (choice !== 'undo') return;
  }
  const result = history.undo(draft);
  draft = result.draft;
  dirty = true;
  pending = null;
  renderAll();
  notify(`Rückgängig gemacht: ${result.label}.`);
};

$('saveDraft').onclick = () => {
  const result = draftStore.saveDraft(draft);
  if (result.ok) { savedAt = result.savedAt; dirty = false; storageProblem = ''; notify('Entwurf auf diesem Gerät gespeichert. Er ist nur in diesem Browser verfügbar.'); }
  else { storageProblem = 'Nicht gespeichert'; notify(result.message); }
  renderStatus();
};
$('deleteDraft').onclick = async () => {
  const choice = await ask('Gespeicherten Entwurf löschen?', 'Der auf diesem Gerät gespeicherte Entwurf wird entfernt. Der geöffnete Entwurf bleibt bestehen, bis du die Seite schliesst.', [{label: 'Löschen', value: 'delete', primary: true}, {label: 'Abbrechen', value: 'cancel'}]);
  if (choice !== 'delete') return;
  const result = draftStore.deleteDraft();
  if (result.ok) { savedAt = null; dirty = true; storageProblem = ''; notify('Gespeicherter Entwurf gelöscht. Der geöffnete Entwurf bleibt bestehen.'); }
  else notify(result.message);
  renderStatus();
};
$('newDraft').onclick = async () => {
  if (!(await confirmReplace('Ein neuer, leerer Entwurf'))) return;
  startBlank();
};
function startBlank() {
  script = null; pending = null; guideState = {skipped: [], stepsDone: false};
  contrib = freshContribution();
  commit({process: blank(), ...blankExtras()}, 'Neuer Entwurf', {newOrigin: ''});
}

// ---- Routing -------------------------------------------------------------------------------------
const VIEWS = ['start', 'lernen', 'prozess', 'bibliothek'];
let firstRoute = true;
function route() {
  const [view = 'start', sub = ''] = decodeURIComponent(location.hash.slice(1)).split('/');
  const name = VIEWS.includes(view) ? view : 'start';
  for (const v of VIEWS) $('view-' + v).hidden = v !== name;
  document.querySelectorAll('[data-route]').forEach(a => { if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  let focusTarget = $('view-' + name).querySelector('h1');
  if (name === 'prozess') { if (['ablauf', 'check', 'vergleich', 'mitnehmen'].includes(sub)) selectTab(sub, false); }
  if (name === 'lernen') { const i = exercises.findIndex(e => e.concept === sub); if (i >= 0) lessonIndex = i; renderLesson(); }
  if (name === 'bibliothek') { renderLibrary(sub); if (sub && library.status === 'ready') focusTarget = $('libDetailTitle') || focusTarget; }
  document.title = {start: 'Pietro · Expertise verbinden', lernen: 'Lernen · Pietro', prozess: 'Mein Prozess · Pietro', bibliothek: 'Prozessbibliothek · Pietro'}[name];
  if (!firstRoute) { focusTarget?.focus(); window.scrollTo(0, 0); }
  firstRoute = false;
}
window.addEventListener('hashchange', route);
const go = hash => { if (location.hash === '#' + hash) route(); else location.hash = hash; };

// ---- Entry actions -------------------------------------------------------------------------------
$('entryExample').onclick = async () => {
  if (!(await confirmReplace('Das Beispiel'))) return;
  startBlank();
  startScript();
  origin = 'Vorbereitetes Beispiel (fiktiv)';
  setMode('guided');
  go('prozess/ablauf');
  renderStatus();
};
$('entryOwn').onclick = async () => {
  if (hasContent(draft)) {
    const choice = await ask('Woran möchtest du arbeiten?', `Du hast bereits einen Entwurf «${draft.process.title}».`, [{label: 'Am aktuellen Entwurf weiterarbeiten', value: 'keep', primary: true}, {label: 'Neuen Entwurf beginnen', value: 'new'}, {label: 'Abbrechen', value: 'cancel'}]);
    if (choice === 'cancel') return;
    if (choice === 'new') { if (!(await confirmReplace('Ein neuer, leerer Entwurf'))) return; startBlank(); }
  }
  script = null;
  setMode('guided');
  go('prozess/ablauf');
  renderGuided();
};
$('entryLibrary').onclick = () => go('bibliothek');

// ---- Workbench tabs --------------------------------------------------------------------------------
const TABS = ['ablauf', 'check', 'vergleich', 'mitnehmen'];
function selectTab(name, focus = true) {
  activeTab = name;
  for (const t of TABS) {
    const tab = $('tab-' + t);
    tab.setAttribute('aria-selected', String(t === name));
    tab.tabIndex = t === name ? 0 : -1;
    $('panel-' + t).hidden = t !== name;
  }
  if (name === 'mitnehmen') renderContribution();
  if (focus) $('tab-' + name).focus();
}
TABS.forEach((t, i) => {
  const tab = $('tab-' + t);
  tab.onclick = () => selectTab(t);
  tab.onkeydown = e => {
    const next = {ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1}[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(TABS[(next + TABS.length) % TABS.length]);
  };
});

// ---- Guided capture ------------------------------------------------------------------------------
function setMode(next) {
  mode = next;
  $('modeGuided').setAttribute('aria-pressed', String(mode === 'guided'));
  $('modeDirect').setAttribute('aria-pressed', String(mode === 'direct'));
  $('guidedPane').hidden = mode !== 'guided';
  $('directPane').hidden = mode !== 'direct';
  if (mode === 'direct') { syncForm(); renderSteps(); } else renderGuided();
}
$('modeGuided').onclick = () => setMode('guided');
$('modeDirect').onclick = () => setMode('direct');

function startScript() {
  script = {turns: scriptedTurns(), index: 0};
  const turn = script.turns[0];
  pending = {proposal: createProposal(turn.ops, {label: turn.label, source: 'scripted-example'}), question: turn.question, answerText: turn.answer, editing: false, values: {}};
}
function advanceScript() {
  if (!script) return;
  script.index++;
  const turn = script.turns[script.index];
  if (!turn) { script = null; pending = null; guideState.stepsDone = true; notify('Drehbuch beendet. Prüfe die Karte und korrigiere sie direkt, wo sie nicht stimmt.'); return; }
  pending = {proposal: createProposal(turn.ops, {label: turn.label, source: 'scripted-example'}), question: turn.question, answerText: turn.answer, editing: false, values: {}};
}

const SOURCE_LABEL = {'guided': 'Aus deiner Antwort', 'scripted-example': 'Vorbereitetes Drehbuch – keine KI', 'keyword-rule': 'Stichwortregel – keine KI'};

function proposalCard(container, state, {onAccept, onReject, extra} = {}) {
  const shown = state.editing ? editProposal(state.proposal, state.values) : state.proposal;
  const preview = previewProposal(draft, shown);
  const list = h('ul', {class: 'preview-lines'}, preview.lines.map(l => h('li', {}, l.text)));
  const editor = state.editing ? h('div', {class: 'proposal-edit'}, preview.lines.flatMap(l => l.edit).map(field => {
    const input = h(field.multiline ? 'textarea' : 'input', {maxlength: field.multiline ? 4000 : 160, value: state.values[field.key] ?? field.value, oninput: e => { state.values[field.key] = e.target.value; const p = previewProposal(draft, editProposal(state.proposal, state.values)); replaceChildren(list, p.lines.map(x => h('li', {}, x.text))); }});
    if (field.multiline) input.value = state.values[field.key] ?? field.value;
    return h('label', {}, field.label, input);
  })) : null;
  const canEdit = preview.lines.some(l => l.edit.length);
  replaceChildren(container,
    h('p', {class: 'eyebrow'}, 'VORSCHLAG · ' + SOURCE_LABEL[state.proposal.source]),
    h('h3', {}, state.proposal.label),
    h('p', {class: 'micro'}, 'Erst nach «Übernehmen» ändert sich dein Entwurf. Danach kannst du die Änderung rückgängig machen.'),
    list, extra || null, editor,
    preview.error ? h('p', {class: 'errors'}, 'Dieser Vorschlag lässt sich so nicht übernehmen: ' + preview.error) : null,
    h('div', {class: 'actions'},
      h('button', {type: 'button', class: 'primary', disabled: !!preview.error, 'data-action': 'accept', onclick: () => onAccept(state.editing ? editProposal(state.proposal, state.values) : state.proposal)}, 'Übernehmen'),
      canEdit ? h('button', {type: 'button', 'data-action': 'edit', 'aria-pressed': String(state.editing), onclick: () => { state.editing = !state.editing; proposalCard(container, state, {onAccept, onReject, extra}); }}, state.editing ? 'Bearbeitung schliessen' : 'Bearbeiten') : null,
      h('button', {type: 'button', 'data-action': 'reject', onclick: onReject}, 'Verwerfen')
    )
  );
  container.hidden = false;
}

function acceptPending(proposal) {
  try {
    const next = applyProposal(draft, proposal);
    commit(next, proposal.label);
    notify(`Übernommen: ${proposal.label}. Rückgängig ist möglich.`);
  } catch (error) { notify('Nicht übernommen: ' + error.message); return; }
  const wasScript = pending?.proposal.source === 'scripted-example';
  pending = null;
  if (wasScript) advanceScript();
  renderGuided();
  focusGuided();
}
function rejectPending() {
  const wasScript = pending?.proposal.source === 'scripted-example';
  pending = null;
  notify('Vorschlag verworfen. Dein Entwurf ist unverändert.');
  if (wasScript) advanceScript();
  renderGuided();
  focusGuided();
}
function focusGuided() { ($('proposalCard').hidden ? $('questionCard') : $('proposalCard')).querySelector('input, textarea, select, button')?.focus(); }

function conceptHelp(concept) {
  if (!concept) return null;
  return h('details', {class: 'concept'}, h('summary', {}, `Was ist ${glossary[concept].term === 'Ergebnis' || glossary[concept].term === 'Auslöser' ? 'ein' : 'eine'} ${glossary[concept].term}?`), h('p', {}, glossary[concept].text), h('a', {href: '#lernen/' + concept}, 'Kurze Übung dazu'));
}

function renderGuided() {
  if (mode !== 'guided') return;
  const banner = $('scriptBanner');
  banner.hidden = !script;
  if (script) replaceChildren(banner, h('b', {}, SCRIPT_TITLE), h('p', {}, `Schritt ${script.index + 1} von ${script.turns.length}. Fragen und Antworten sind vorbereitet, keine KI. Du entscheidest bei jedem Vorschlag, ob er übernommen wird.`), h('button', {type: 'button', class: 'quiet', onclick: () => { script = null; pending = null; renderGuided(); notify('Drehbuch beendet. Du kannst mit eigenen Antworten weitermachen.'); }}, 'Drehbuch beenden'));
  const card = $('questionCard');
  if (pending && pending.proposal.source === 'scripted-example') {
    replaceChildren(card, h('p', {class: 'eyebrow'}, 'PIETRO FRAGT'), h('p', {class: 'question'}, pending.question), h('blockquote', {class: 'answer-quote'}, h('span', {class: 'micro'}, 'Vorbereitete Beispielantwort'), h('br'), pending.answerText));
    proposalCard($('proposalCard'), pending, {onAccept: acceptPending, onReject: rejectPending});
    return;
  }
  if (pending) {
    replaceChildren(card, h('p', {class: 'eyebrow'}, 'DEINE ANTWORT'), h('p', {class: 'question'}, pending.question.prompt));
    proposalCard($('proposalCard'), pending, {onAccept: acceptPending, onReject: rejectPending});
    return;
  }
  $('proposalCard').hidden = true;
  const q = nextQuestion(draft, guideState);
  if (!q) {
    replaceChildren(card,
      h('p', {class: 'eyebrow'}, 'GRUNDBESCHREIBUNG ERFASST'),
      h('p', {class: 'question'}, 'Stimmt die Karte mit dem tatsächlichen Ablauf überein?'),
      h('p', {class: 'micro'}, 'Korrigiere Bezeichnungen, Rollen und Verbindungen direkt. Danach zeigt der Prozess-Check offene Fragen und begründete Hypothesen.'),
      h('div', {class: 'actions'},
        h('button', {type: 'button', class: 'primary', onclick: () => setMode('direct')}, 'Karte direkt korrigieren'),
        h('button', {type: 'button', onclick: () => selectTab('check')}, 'Prozess-Check öffnen'),
        guideState.skipped.length || guideState.stepsDone ? h('button', {type: 'button', class: 'quiet', onclick: () => { guideState = {skipped: [], stepsDone: false}; renderGuided(); }}, 'Fragen erneut stellen') : null));
    return;
  }
  const inputs = {};
  const field = (key, label, attrs = {}) => { inputs[key] = h(attrs.multiline ? 'textarea' : 'input', {maxlength: attrs.multiline ? 4000 : 160, placeholder: attrs.placeholder || '', id: 'g-' + key}); return h('label', {}, label, inputs[key]); };
  const body = [];
  if (q.kind === 'text') body.push(field('value', 'Deine Antwort', {placeholder: q.placeholder, multiline: q.multiline}));
  if (q.kind === 'choice') {
    inputs.value = h('select', {id: 'g-value'}, h('option', {value: 'yes'}, 'Ja'), h('option', {value: 'no'}, 'Nein'), h('option', {value: 'unknown'}, 'Weiss nicht'));
    body.push(h('label', {}, 'Deine Antwort', inputs.value));
  }
  if (q.kind === 'step') body.push(field('label', 'Tätigkeit (Verb + Gegenstand)', {placeholder: 'z. B. Belege prüfen'}), field('role', 'Wer macht das?', {placeholder: 'Rolle oder Team'}), field('system', 'Werkzeug (optional)', {placeholder: 'z. B. Formular, E-Mail, System'}));
  if (q.kind === 'decision') {
    const steps = draft.process.steps;
    const option = s => h('option', {value: s.id}, `${steps.indexOf(s) + 1}. ${s.label || 'ohne Bezeichnung'}`);
    inputs.afterId = h('select', {id: 'g-after'}, steps.filter(s => s.type === 'task').map(option));
    inputs.afterId.value = steps.filter(s => s.type === 'task').at(-1)?.id || '';
    inputs.noTarget = h('select', {id: 'g-no'}, h('option', {value: 'rework'}, 'Etwas wird nachgeholt, dann geht es zurück'), h('option', {value: 'end'}, 'Der Vorgang endet'), steps.map(option));
    inputs.returnTo = h('select', {id: 'g-return'}, steps.filter(s => s.type === 'task').map(option));
    const reworkFields = h('div', {class: 'sub-fields'}, field('reworkLabel', 'Was wird bei Nein getan?', {placeholder: 'z. B. Fehlende Belege nachfordern'}), field('reworkRole', 'Wer macht das?'), h('label', {}, 'Danach zurück zu', inputs.returnTo));
    inputs.noTarget.onchange = () => { reworkFields.hidden = inputs.noTarget.value !== 'rework'; };
    const syncReturn = () => { inputs.returnTo.value = inputs.afterId.value; };
    inputs.afterId.onchange = syncReturn; syncReturn();
    body.push(h('label', {}, 'Nach welchem Schritt?', inputs.afterId), field('label', 'Entscheidungsfrage', {placeholder: 'z. B. Belege vollständig?'}), field('role', 'Wer entscheidet?'), h('label', {}, 'Was passiert bei Nein?', inputs.noTarget), reworkFields);
  }
  const submit = () => {
    const answer = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
    try {
      pending = {proposal: proposalForAnswer(draft, q, answer), question: q, editing: false, values: {}};
      renderGuided();
      focusGuided();
    } catch (error) { notify(error.message); }
  };
  const form = h('form', {class: 'guided-form', onsubmit: e => { e.preventDefault(); submit(); }}, body,
    h('div', {class: 'actions'},
      h('button', {type: 'submit', class: 'primary'}, 'Vorschlag ansehen'),
      q.kind === 'decision' ? h('button', {type: 'button', onclick: () => { pending = {proposal: proposalForAnswer(draft, q, {none: true}), question: q, editing: false, values: {}}; renderGuided(); focusGuided(); }}, 'Nein, läuft immer gleich') : null,
      q.kind === 'step' && q.canFinish ? h('button', {type: 'button', onclick: () => { guideState.stepsDone = true; renderGuided(); focusGuided(); }}, 'Keine weiteren Schritte') : null,
      h('button', {type: 'button', class: 'quiet', onclick: () => { guideState.skipped.push(q.id); renderGuided(); focusGuided(); }}, 'Überspringen')));
  const done = completeness(draft.process, draft);
  replaceChildren(card, h('p', {class: 'eyebrow'}, `PIETRO FRAGT · ${done.done} VON ${done.total} BESCHRIEBEN`), h('p', {class: 'question', id: 'guidedQuestion'}, q.prompt), h('p', {class: 'micro'}, q.help), conceptHelp(q.concept), form);
}

$('narrative').oninput = e => { draft.narrative = e.target.value; touched(); };

// ---- Direct editing ------------------------------------------------------------------------------
const FIELDS = ['title', 'owner', 'trigger', 'outcome', 'lens', 'pain', 'frequency'];
const OPPORTUNITY = ['kind', 'hypothesis', 'measure', 'next'];
function syncForm() {
  for (const k of FIELDS) $(k).value = draft.process[k];
  for (const k of OPPORTUNITY) $(k).value = draft.process.opportunity[k];
  for (const [k] of checks) $('check-' + k).value = draft.process.checks[k];
  $('reportedDuplicate').value = draft.reported.duplicateEntry;
  $('narrative').value = draft.narrative;
}
for (const k of FIELDS) $(k).addEventListener('input', () => { draft.process[k] = $(k).value; touched(); validate(); });
for (const k of OPPORTUNITY) $(k).addEventListener('input', () => { draft.process.opportunity[k] = $(k).value; touched(); });
$('reportedDuplicate').onchange = e => { draft.reported.duplicateEntry = e.target.value; touched(); };
replaceChildren($('checks'), checks.map(([k, label]) => h('label', {for: 'check-' + k}, label, h('select', {id: 'check-' + k}, h('option', {value: 'unknown'}, 'Offen'), h('option', {value: 'yes'}, 'Ja'), h('option', {value: 'no'}, 'Nein')))));
for (const [k] of checks) $('check-' + k).addEventListener('change', e => { draft.process.checks[k] = e.target.value; touched(); });

function targets(current) {
  return [...draft.process.steps.map((s, i) => `<option value="${esc(s.id)}" ${s.id === current ? 'selected' : ''}>${i + 1}. ${esc(s.label || 'Unbenannter Schritt')}</option>`), `<option value="end" ${current === 'end' ? 'selected' : ''}>Ende</option>`].join('');
}
function renderSteps() {
  const steps = draft.process.steps;
  $('stepList').innerHTML = steps.map((s, i) => `<article class="step" data-id="${esc(s.id)}" aria-label="Schritt ${i + 1}"><span class="step-num">${String(i + 1).padStart(2, '0')}</span><label>${s.type === 'decision' ? 'Welche Frage wird entschieden?' : 'Was wird getan?'}<input data-field="label" maxlength="160" value="${esc(s.label)}" placeholder="Verb + Gegenstand"></label><label>Wer macht das?<input data-field="role" maxlength="160" value="${esc(s.role)}" placeholder="Rolle / Team"></label><div class="step-more"><label>Art<select data-field="type"><option value="task" ${s.type === 'task' ? 'selected' : ''}>Tätigkeit</option><option value="decision" ${s.type === 'decision' ? 'selected' : ''}>Entscheidung (Ja / Nein)</option></select></label>${s.type === 'decision' ? `<label>Bei Ja zu<select data-field="yes">${targets(s.yes)}</select></label><label>Bei Nein zu<select data-field="no">${targets(s.no)}</select></label>` : `<label>Danach zu<select data-field="next">${targets(s.next)}</select></label>`}</div><details><summary>System, Information oder Ausnahme</summary><label>Werkzeug / Informationsquelle<input data-field="system" maxlength="160" value="${esc(s.system)}"></label><label>Hinweis<textarea data-field="note" maxlength="4000">${esc(s.note)}</textarea></label></details><div class="step-controls"><button type="button" data-action="up" ${i === 0 ? 'disabled' : ''} aria-label="Schritt ${i + 1} früher">↑ Früher</button><button type="button" data-action="down" ${i === steps.length - 1 ? 'disabled' : ''} aria-label="Schritt ${i + 1} später">↓ Später</button><button type="button" data-action="remove" aria-label="Schritt ${i + 1} entfernen">Entfernen</button></div></article>`).join('') || '<p class="micro">Noch keine Schritte. Ergänze den ersten Schritt oder nutze die geführten Fragen.</p>';
  validate();
}
function validate() {
  const list = issues(draft.process);
  $('validation').textContent = list.length ? list.join(' ') : 'Die Grundstruktur ist erfasst. Prüft jetzt mit den Beteiligten, ob sie dem tatsächlichen Ablauf entspricht.';
}
$('stepList').addEventListener('input', e => {
  const key = e.target.dataset.field;
  if (!key) return;
  const s = draft.process.steps.find(x => x.id === e.target.closest('.step').dataset.id);
  s[key] = e.target.value;
  if (key === 'type') {
    if (s.type === 'decision') { s.yes = s.next; s.no = s.next; } else { s.next = s.yes || 'end'; delete s.yes; delete s.no; }
    renderSteps();
  }
  if (key === 'yes') s.next = s.yes;
  touched();
  validate();
});
$('stepList').addEventListener('click', e => {
  const action = e.target.dataset.action;
  if (!action) return;
  const id = e.target.closest('.step').dataset.id;
  const steps = draft.process.steps;
  const index = steps.findIndex(s => s.id === id);
  if (action === 'remove') {
    const s = steps[index];
    const fallback = (s.type === 'decision' ? s.yes : s.next) === id ? 'end' : (s.type === 'decision' ? s.yes : s.next);
    commit((() => { const next = clone(draft); next.process.steps.splice(index, 1); for (const other of next.process.steps) for (const k of ['next', 'yes', 'no']) if (other[k] === id) other[k] = fallback; return next; })(), `Schritt ${index + 1} entfernen`);
    notify(`Schritt ${index + 1} entfernt. Rückgängig ist möglich.`);
    return;
  }
  const dest = index + (action === 'up' ? -1 : 1);
  if (dest < 0 || dest >= steps.length) return;
  [steps[index], steps[dest]] = [steps[dest], steps[index]];
  notify('Reihenfolge geändert. Bestehende Verbindungen bleiben erhalten; bitte prüfen.');
  touched();
  renderSteps();
  $('stepList').querySelector(`[data-id="${CSS.escape(id)}"] [data-action="${action}"]`)?.focus();
});
$('addStep').onclick = () => {
  const p = draft.process;
  if (p.steps.length >= 15) return notify('Maximal 15 Schritte. Teile grössere Prozesse in Teilprozesse auf.');
  const id = newStepId(p);
  const previous = p.steps.at(-1);
  if (previous?.type === 'task' && previous.next === 'end') previous.next = id;
  p.steps.push({id, label: '', role: '', type: 'task', next: 'end', system: '', note: ''});
  touched();
  renderSteps();
  $('stepList').lastElementChild.querySelector('input').focus();
};

// ---- Map, text alternative, insights -------------------------------------------------------------
const LENS_HINTS = {work: 'Achte auf Tätigkeiten, Rollenwechsel und doppelte Arbeit.', service: 'Achte darauf, wo Anfragende warten oder Informationen nachliefern müssen.', decisions: 'Achte darauf, wer welche Entscheidung trifft und wohin jede Antwort führt.', data: 'Achte auf Quellen, Werkzeuge und die erneute Eingabe derselben Informationen.'};
function renderMapInto(container, list, process, options) {
  if (!process.steps.length) { container.innerHTML = '<p class="map-empty">Die Karte wartet auf den ersten Schritt.</p>'; replaceChildren(list); return; }
  container.innerHTML = mapSvg(process, options);
  replaceChildren(list, textAlternative(process).map(item => h('li', {'data-id': item.id}, h('b', {}, item.title), item.detail ? h('span', {}, ' – ' + item.detail) : null)));
}
function refreshDerived() {
  renderStatus();
  $('lensHint').textContent = `Perspektive «${lenses[draft.process.lens]}»: ${LENS_HINTS[draft.process.lens]}`;
  renderMapInto($('mapContainer'), $('mapText'), draft.process, {idPrefix: 'own'});
  const c = completeness(draft.process, draft);
  replaceChildren($('completeness'), c.items.map(i => h('li', {class: i.done ? 'done' : 'open'}, h('span', {class: 'sr-only'}, i.done ? 'Erledigt: ' : 'Offen: '), i.label)));
  const review = reviewProcess(draft.process, draft);
  replaceChildren($('nextHints'), review.questions.slice(0, 3).map(q => h('li', {}, q.title)), review.questions.length ? null : h('li', {}, 'Keine offenen Fragen aus den Regeln.'));
  renderCheck(review);
  renderCompare();
  if (activeTab === 'mitnehmen') renderContribution();
}
function renderAll() {
  syncForm();
  if (mode === 'direct') renderSteps(); else renderGuided();
  refreshDerived();
}

replaceChildren($('glossary'), Object.entries(glossary).map(([key, g]) => h('details', {class: 'concept'}, h('summary', {}, g.term), h('p', {}, g.text), h('a', {href: '#lernen/' + key}, 'Übung öffnen'))));

// ---- Prozess-Check -------------------------------------------------------------------------------
const FIELD_TARGET = {title: 'title', owner: 'owner', trigger: 'trigger', outcome: 'outcome', pain: 'pain', frequency: 'frequency', 'reported.duplicateEntry': 'reportedDuplicate', 'opportunity.hypothesis': 'hypothesis'};
function focusRef(ref) {
  if (ref.kind === 'step') {
    selectTab('ablauf', false);
    setMode('direct');
    const el = $('stepList').querySelector(`[data-id="${CSS.escape(ref.id)}"] input`);
    el?.scrollIntoView({block: 'center'}); el?.focus();
    return;
  }
  if (ref.id === 'checks.validated') { selectTab('check', false); document.querySelector('.checks-details').open = true; $('check-validated').focus(); return; }
  if (ref.id === 'opportunity.hypothesis') { selectTab('check', false); $('hypothesis').focus(); return; }
  selectTab('ablauf', false);
  setMode('direct');
  const el = $(FIELD_TARGET[ref.id] || 'addStep');
  el?.scrollIntoView({block: 'center'}); el?.focus();
}
function findingItem(f) {
  return h('li', {class: 'finding'}, h('b', {}, f.title), h('p', {}, f.detail),
    f.refs.length ? h('div', {class: 'refs'}, h('span', {class: 'micro'}, 'Bezug: '), f.refs.slice(0, 8).map(r => h('button', {type: 'button', class: 'ref', onclick: () => focusRef(r), title: 'Zur Stelle springen'}, r.kind === 'step' ? `${r.label} · ${r.id}` : r.label))) : null,
    f.pattern ? h('a', {href: '#bibliothek/' + f.pattern, class: 'micro'}, 'Verwandtes Muster ansehen') : null);
}
function renderCheck(review) {
  replaceChildren($('factsList'), review.facts.map(findingItem), review.facts.length ? null : h('li', {class: 'micro'}, 'Noch keine Angaben.'));
  replaceChildren($('questionsList'), review.questions.map(findingItem), review.questions.length ? null : h('li', {class: 'micro'}, 'Keine offenen Fragen aus den Regeln. Prüft den Ablauf trotzdem mit den Beteiligten.'));
  replaceChildren($('hypothesesList'), review.hypotheses.map(findingItem), review.hypotheses.length ? null : h('li', {class: 'micro'}, 'Noch keine begründete Hypothese. Hypothesen entstehen aus Rückwegen, gemeldeter Doppelerfassung oder deiner eigenen Angabe.'));
}

// ---- Downloads -----------------------------------------------------------------------------------
function fileBase() { return 'prozess-' + (draft.process.title.toLowerCase().replace(/[^a-z0-9äöü-]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'entwurf'); }
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type}));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportJson() { download(fileBase() + '.json', serializeProcessFile(draft), 'application/json'); dirty = false; renderStatus(); }
const exportReport = () => download(fileBase() + '-prozess-check.md', reportMarkdown(draft.process, reviewProcess(draft.process, draft), draft), 'text/markdown');
$('exportJson').onclick = exportJson;
$('exportMd').onclick = () => download(fileBase() + '.md', markdown(draft.process), 'text/markdown');
$('exportMmd').onclick = () => download(fileBase() + '.mmd', mermaid(draft.process), 'text/plain');
$('exportReport').onclick = exportReport;
$('exportReport2').onclick = exportReport;
$('importFile').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let next;
  try {
    if (file.size > 100000) throw Error('Datei ist zu gross (maximal 100 KB).');
    next = parseDraft(await file.text());
  } catch (error) { notify('Import fehlgeschlagen: ' + error.message + ' Dein bisheriger Entwurf ist unverändert.'); return; }
  if (!(await confirmReplace('Die importierte Datei'))) return;
  script = null; pending = null; contrib = freshContribution();
  commit(next, 'Import', {newOrigin: 'Importiert aus Datei'});
  notify('Arbeitsstand importiert.');
  selectTab('ablauf', false);
};

// ---- Library -------------------------------------------------------------------------------------
async function loadLibrary() {
  library = {status: 'loading', entries: [], taxonomy: null, error: ''};
  renderLibraryIfVisible();
  try {
    const {entries, taxonomy} = await libraryStore.load();
    library = {status: 'ready', entries, taxonomy, error: ''};
    adapter = createOfflineAdapter({taxonomy});
    populateTaxonomy();
  } catch (error) {
    libraryStore.reset();
    library = {status: 'error', entries: [], taxonomy: null, error: error.message};
  }
  renderLibraryIfVisible();
  renderCompare();
  if (activeTab === 'mitnehmen') renderContribution();
}
function renderLibraryIfVisible() { if (!$('view-bibliothek').hidden) renderLibrary(decodeURIComponent(location.hash.slice(1)).split('/')[1] || ''); }

function populateTaxonomy() {
  const t = library.taxonomy;
  const options = (select, items, first) => replaceChildren(select, h('option', {value: ''}, first), items.map(i => h('option', {value: i.id}, i.label)));
  options($('libFamily'), t.families, 'Alle Familien');
  options($('libTag'), t.activityTags, 'Alle Tätigkeiten');
  options($('ownFamily'), t.families.filter(f => f.id !== 'uebergreifend'), 'Noch nicht gewählt');
  options($('cFamily'), t.families.filter(f => f.id !== 'uebergreifend'), 'Bitte wählen');
}

const kindLabel = e => e.kind === 'pattern' ? 'Muster' : e.kind === 'improvement-case' ? 'Verbesserungsfall' : 'Beispiel';
const tagLabel = (group, id) => labelFor(library.taxonomy, group, id);
const byId = id => library.entries.find(e => e.id === id);

function libraryState() {
  return {query: $('libSearch').value, familyId: $('libFamily').value, activityTag: $('libTag').value, kind: $('libKind').value};
}
for (const id of ['libSearch', 'libFamily', 'libTag', 'libKind']) $(id).addEventListener('input', () => renderLibrary(''));

function renderLibrary(detailId) {
  const status = $('libStatus');
  if (library.status === 'loading') { replaceChildren(status, h('p', {}, 'Bibliothek wird geladen …')); replaceChildren($('libResults')); return; }
  if (library.status === 'error') {
    $('libList').hidden = false; $('libDetail').hidden = true;
    replaceChildren(status, h('div', {class: 'error-box'}, h('b', {}, 'Die Bibliothek konnte nicht geladen werden.'), h('p', {}, library.error + ' Deine persönliche Arbeit unter «Mein Prozess» ist davon nicht betroffen.'), h('button', {type: 'button', onclick: loadLibrary}, 'Erneut versuchen')));
    replaceChildren($('libResults'));
    return;
  }
  if (detailId) {
    const entry = byId(detailId);
    if (entry) { $('libList').hidden = true; $('libDetail').hidden = false; renderDetail(entry); return; }
    notify('Diesen Eintrag gibt es nicht.');
  }
  $('libList').hidden = false; $('libDetail').hidden = true;
  const filters = libraryState();
  const results = searchEntries(library.entries, filters);
  const filtered = Object.values(filters).some(Boolean);
  replaceChildren(status, results.length
    ? h('p', {}, `${results.length} von ${library.entries.length} Einträgen${filtered ? ' passen zu deiner Auswahl' : ''}.`)
    : h('div', {class: 'empty-box'}, h('b', {}, 'Keine Einträge gefunden.'), h('p', {}, 'Die Suche durchsucht Titel und Zusammenfassung. Versuche einen anderen Begriff oder entferne einen Filter.'), h('button', {type: 'button', onclick: () => { $('libSearch').value = ''; $('libFamily').value = ''; $('libTag').value = ''; $('libKind').value = ''; renderLibrary(''); $('libSearch').focus(); }}, 'Filter zurücksetzen')));
  replaceChildren($('libResults'), results.map(e => h('li', {class: 'lib-card'},
    h('div', {class: 'badges'}, h('span', {class: 'pill'}, kindLabel(e)), e.fictional ? h('span', {class: 'pill fictional'}, 'Fiktiv') : null, h('span', {class: 'pill quiet-pill'}, tagLabel('families', e.classification.familyId))),
    h('h2', {}, h('a', {href: '#bibliothek/' + e.id}, e.title)),
    h('p', {}, e.summary),
    h('p', {class: 'tags'}, e.classification.activityTags.map(t => h('span', {class: 'tag'}, tagLabel('activityTags', t))))
  )));
}

function statusTrio(e) {
  const cell = (title, value, extra) => h('div', {class: 'status-cell'}, h('span', {class: 'eyebrow'}, title), h('b', {}, value), extra ? h('p', {class: 'micro'}, extra) : null);
  return h('div', {class: 'status-trio', role: 'group', 'aria-label': 'Prüfung, Wirkung und Verbindlichkeit'},
    cell('Fachliche Prüfung', REVIEW_STATUS[e.review.status], e.review.reviewedByRole ? `${e.review.reviewedByRole}, ${e.review.reviewedAt}` : 'Niemand hat diese Beschreibung fachlich bestätigt.'),
    cell('Wirkung', EFFECTIVENESS_STATUS[e.effectiveness.status], e.effectiveness.evidenceRefs.length ? 'Belege: ' + e.effectiveness.evidenceRefs.join(', ') : 'Keine Messung vorhanden.'),
    cell('Verbindlichkeit', AUTHORITY_STATUS[e.authority.status], e.authority.authoritySource ? `${e.authority.scope} · ${e.authority.authoritySource}` : 'Ein Beispiel ist keine Vorgabe.'));
}

function renderDetail(e) {
  const container = $('libDetail');
  const section = (title, ...content) => h('section', {class: 'detail-section'}, h('h2', {}, title), ...content);
  const list = items => items.length ? h('ul', {}, items.map(i => h('li', {}, i))) : h('p', {class: 'micro'}, 'Keine Angaben.');
  const links = ids => ids.length ? h('ul', {class: 'link-list'}, ids.map(byId).filter(Boolean).map(x => h('li', {}, h('a', {href: '#bibliothek/' + x.id}, x.title), h('span', {class: 'micro'}, ' · ' + kindLabel(x))))) : h('p', {class: 'micro'}, 'Keine.');
  const head = [
    h('a', {href: '#bibliothek', class: 'back'}, '← Zur Übersicht'),
    h('div', {class: 'badges'}, h('span', {class: 'pill'}, kindLabel(e)), e.fictional ? h('span', {class: 'pill fictional'}, 'Fiktiv – keine reale Vorgabe') : null, h('span', {class: 'pill quiet-pill'}, tagLabel('families', e.classification.familyId))),
    h('h1', {id: 'libDetailTitle', tabindex: '-1'}, e.title),
    h('p', {class: 'intro'}, e.summary),
    statusTrio(e),
    h('dl', {class: 'facts'},
      h('dt', {}, 'Kontext'), h('dd', {}, e.context.scope),
      h('dt', {}, 'Herkunft'), h('dd', {}, e.provenance.sourceLabel + (e.provenance.sourceRefs.length ? ` (aus: ${e.provenance.sourceRefs.map(id => byId(id)?.title || id).join(', ')})` : '')),
      h('dt', {}, 'Pflege'), h('dd', {}, `${e.maintenance.ownerRole || 'Nicht festgelegt'}${e.maintenance.reviewDue ? ' · nächste Prüfung bis ' + e.maintenance.reviewDue : ''}`),
      h('dt', {}, 'Tätigkeiten'), h('dd', {}, e.classification.activityTags.map(t => tagLabel('activityTags', t)).join(', ')))
  ];
  if (e.kind === 'pattern') {
    const users = library.entries.filter(x => x.patternIds.includes(e.id));
    replaceChildren(container, head,
      section('Schritte des Musters', h('ol', {}, e.pattern.steps.map(s => h('li', {}, h('b', {}, s.label), s.roleHint ? h('span', {class: 'micro'}, ' · ' + s.roleHint) : null)))),
      section('Voraussetzungen', list(e.pattern.prerequisites)),
      section('Grenzen', list(e.pattern.limits)),
      section('Fragen vor der Wiederverwendung', list(e.pattern.questionsBeforeReuse)),
      section('Beispiele mit diesem Muster', links(users.map(u => u.id))),
      e.context.constraints.length ? section('Hinweis', list(e.context.constraints)) : null);
    return;
  }
  const mapBox = h('div', {class: 'map-container'}), textList = h('ol', {class: 'map-text'});
  renderMapInto(mapBox, textList, e.process, {idPrefix: 'lib-' + e.id});
  const others = library.entries.filter(x => x.id !== e.id && x.kind !== 'pattern');
  const compareSelect = h('select', {id: 'compareWith'}, others.map(o => h('option', {value: o.id}, o.title)));
  if (e.relatedIds[0] && others.some(o => o.id === e.relatedIds[0])) compareSelect.value = e.relatedIds[0];
  const compareOut = h('div', {id: 'libComparison'});
  replaceChildren(container, head,
    h('div', {class: 'actions'}, h('button', {type: 'button', class: 'primary', id: 'useAsDraft', onclick: () => useAsDraft(e)}, 'Als eigenen Entwurf verwenden'), h('span', {class: 'micro'}, 'Öffnet eine Kopie in «Mein Prozess». Der Bibliothekseintrag bleibt unverändert.')),
    section('Ablauf', mapBox, h('h3', {}, 'Ablauf als Text'), textList),
    section('Lokale Unterschiede und Bedingungen', list(e.context.constraints)),
    section('Offene Fragen', list(e.openQuestions || [])),
    section('Verwandte Muster', links(e.patternIds)),
    section('Verwandte Beispiele', links(e.relatedIds)),
    section('Vergleichen', h('form', {class: 'inline-form', onsubmit: ev => { ev.preventDefault(); renderComparison(compareOut, e, byId(compareSelect.value)); }}, h('label', {}, 'Vergleichen mit', compareSelect), h('button', {type: 'submit'}, 'Vergleichen')), compareOut));
}

async function useAsDraft(entry) {
  if (!(await confirmReplace(`Die Kopie von «${entry.title}»`))) return;
  script = null; pending = null; guideState = {skipped: [], stepsDone: true}; contrib = freshContribution();
  const next = {process: clone(entry.process), ...blankExtras(), classification: clone(entry.classification)};
  commit(next, 'Bibliotheksbeispiel öffnen', {newOrigin: `Kopie von «${entry.title}» (fiktiv)`});
  setMode('direct');
  go('prozess/ablauf');
  notify('Kopie geöffnet. Korrigiere sie für deinen Kontext.');
}

/** Comparison of two entries (or the own draft and an entry): shared patterns, local constraints, questions. */
function renderComparison(container, a, b, {aIsDraft = false} = {}) {
  if (!b) return;
  const c = compareEntries(a, b);
  const patterns = (aIsDraft ? b.patternIds : c.sharedPatternIds).map(byId).filter(Boolean);
  const tags = ids => ids.length ? h('ul', {class: 'tags'}, ids.map(t => h('li', {class: 'tag'}, tagLabel('activityTags', t)))) : h('p', {class: 'micro'}, 'Keine.');
  const list = (items, empty) => items.length ? h('ul', {}, items.map(i => h('li', {}, i))) : h('p', {class: 'micro'}, empty);
  const questions = questionsBeforeReuse(aIsDraft ? [b] : [a, b], patterns);
  replaceChildren(container, h('div', {class: 'comparison', 'aria-live': 'polite'},
    h('h3', {}, `${a.title} ↔ ${b.title}`),
    h('p', {class: 'note'}, 'So wird verglichen: über die vergebenen Tätigkeits-Tags und Musterverweise. Das ist ein fester Abgleich, keine inhaltliche oder semantische Analyse. Gleiche Tags bedeuten ähnliche Tätigkeiten, nicht gleiche Regeln.'),
    h('h4', {}, 'Gemeinsame Tätigkeitsmuster'), tags(c.sharedActivityTags),
    h('h4', {}, aIsDraft ? 'Muster des Beispiels – kommen sie bei dir vor?' : 'Gemeinsame wiederverwendbare Muster'),
    patterns.length ? h('ul', {class: 'link-list'}, patterns.map(p => h('li', {}, h('a', {href: '#bibliothek/' + p.id}, p.title), h('span', {class: 'micro'}, ' – ' + p.summary)))) : h('p', {class: 'micro'}, 'Keine gemeinsamen Muster hinterlegt.'),
    h('div', {class: 'two-col'},
      h('div', {}, h('h4', {}, `Nur bei «${a.title}»`), tags(c.onlyA), h('h4', {}, 'Lokale Bedingungen'), list(c.constraintsA, aIsDraft ? 'Noch nicht beschrieben. Du kannst sie beim Beitragen ergänzen.' : 'Keine.'), h('h4', {}, 'Rollen'), list(c.rolesA, 'Keine.')),
      h('div', {}, h('h4', {}, `Nur bei «${b.title}»`), tags(c.onlyB), h('h4', {}, 'Lokale Bedingungen'), list(c.constraintsB, 'Keine.'), h('h4', {}, 'Rollen'), list(c.rolesB, 'Keine.'))),
    h('h4', {}, 'Fragen vor der Wiederverwendung'),
    list(questions.map(q => `${q.text} (${byId(q.source)?.title || q.source})`), 'Keine.')));
}

// ---- Vergleich (own draft) -----------------------------------------------------------------------
function renderCompare() {
  if (library.status !== 'ready') {
    $('relatedStatus').textContent = library.status === 'loading' ? 'Bibliothek wird geladen …' : 'Die Bibliothek ist gerade nicht verfügbar. Deine Arbeit bleibt davon unberührt; versuche es in der Prozessbibliothek erneut.';
    replaceChildren($('ownActivity')); replaceChildren($('ownFriction')); replaceChildren($('relatedList'));
    $('suggestTags').disabled = true;
    return;
  }
  $('suggestTags').disabled = false;
  const c = draft.classification, t = library.taxonomy;
  $('ownFamily').value = c.familyId;
  const boxes = (container, items, key) => replaceChildren(container, items.map(item => h('label', {class: 'check'}, h('input', {type: 'checkbox', value: item.id, checked: c[key].includes(item.id), onchange: e => { const set = new Set(draft.classification[key]); if (e.target.checked) set.add(item.id); else set.delete(item.id); draft.classification[key] = [...set]; touched(); }}), ' ' + item.label)));
  if (!$('ownActivity').contains(document.activeElement)) boxes($('ownActivity'), t.activityTags, 'activityTags');
  if (!$('ownFriction').contains(document.activeElement)) boxes($('ownFriction'), t.frictionTags, 'frictionTags');
  const related = relatedForDraft(c, library.entries);
  $('relatedStatus').textContent = c.activityTags.length || c.familyId ? (related.length ? `${related.length} verwandte Einträge, sortiert nach Anzahl gemeinsamer Tags.` : 'Keine Einträge mit gemeinsamen Tags gefunden.') : 'Wähle Familie und Tätigkeiten, um verwandte Einträge zu sehen.';
  replaceChildren($('relatedList'), related.map(r => h('li', {class: 'related'},
    h('b', {}, r.entry.title), h('span', {class: 'micro'}, ' · ' + kindLabel(r.entry)),
    h('p', {class: 'micro'}, [r.sharedActivity.length ? `${r.sharedActivity.length} gemeinsame Tätigkeiten: ${r.sharedActivity.map(x => tagLabel('activityTags', x)).join(', ')}` : '', r.sharedFriction.length ? `Reibung: ${r.sharedFriction.map(x => tagLabel('frictionTags', x)).join(', ')}` : '', r.sameFamily ? 'gleiche Familie' : ''].filter(Boolean).join(' · ')),
    h('div', {class: 'actions'}, r.entry.kind !== 'pattern' ? h('button', {type: 'button', onclick: () => renderComparison($('ownComparison'), draftAsEntry(), r.entry, {aIsDraft: true})}, 'Mit meinem Entwurf vergleichen') : null, h('a', {href: '#bibliothek/' + r.entry.id}, 'Ansehen')))));
}
function draftAsEntry() {
  return {id: 'draft', title: draft.process.title + ' (dein Entwurf)', classification: draft.classification, patternIds: [], context: {constraints: []}, process: draft.process, openQuestions: []};
}
$('ownFamily').onchange = e => { draft.classification.familyId = e.target.value; touched(); };
$('suggestTags').onclick = async () => {
  const suggestion = await adapter.suggestClassification(draft.process, draft);
  const c = draft.classification;
  const activity = suggestion.activityTags.filter(t => !c.activityTags.includes(t.id));
  const friction = suggestion.frictionTags.filter(t => !c.frictionTags.includes(t.id));
  if (!activity.length && !friction.length) { notify('Die Stichwortregel findet keine zusätzlichen Tags.'); return; }
  const where = ref => ref === 'title' ? 'Titel' : ref === 'pain' ? 'Reibung' : ref === 'reported' ? 'Selbstauskunft' : `Schritt ${draft.process.steps.findIndex(s => s.id === ref) + 1}`;
  tagPending = {proposal: createProposal([{op: 'setClassification', activityTags: activity.map(t => t.id), frictionTags: friction.map(t => t.id)}], {label: 'Vorgeschlagene Tags', source: 'keyword-rule'}), editing: false, values: {}};
  const evidence = h('ul', {class: 'evidence'}, [...activity.map(t => [t, 'activityTags']), ...friction.map(t => [t, 'frictionTags'])].map(([t, group]) => h('li', {}, h('b', {}, tagLabel(group, t.id)), ` – Stichwort «${t.evidence[0].keyword}» in ${t.evidence.map(e => where(e.ref)).join(', ')}`)));
  proposalCard($('tagProposal'), tagPending, {extra: evidence,
    onAccept: proposal => { commit(applyProposal(draft, proposal), 'Tags übernehmen'); tagPending = null; $('tagProposal').hidden = true; notify('Tags übernommen. Rückgängig ist möglich.'); },
    onReject: () => { tagPending = null; $('tagProposal').hidden = true; notify('Vorschlag verworfen.'); }});
  $('tagProposal').querySelector('button')?.focus();
};

// ---- Contribution --------------------------------------------------------------------------------
replaceChildren($('cRedactions'), Object.entries(REDACTIONS).map(([key, label]) => h('label', {class: 'check'}, h('input', {type: 'checkbox', id: 'c-' + key, checked: DEFAULT_OPTIONS[key]}), ' ' + label)));
$('cStatement').textContent = SHARING_STATEMENT;
$('cLimit').textContent = SHARING_LIMIT;
function contributionForm() {
  if (!contrib.form) {
    const review = reviewProcess(draft.process, draft);
    contrib.form = {title: draft.process.title, summary: '', scope: '', constraints: '', familyId: draft.classification.familyId, fictional: false, openQuestions: review.questions.map(q => q.title).join('\n'), ...DEFAULT_OPTIONS};
    $('cConfirm').checked = false;
  }
  if (!contrib.titleTouched) contrib.form.title = draft.process.title;
  if (!contrib.form.familyId && draft.classification.familyId) contrib.form.familyId = draft.classification.familyId;
  return contrib.form;
}
function renderContribution() {
  const form = contributionForm();
  const set = (id, value) => { if (document.activeElement !== $(id)) $(id).value = value; };
  set('cTitle', form.title); set('cSummary', form.summary); set('cScope', form.scope); set('cConstraints', form.constraints); set('cQuestions', form.openQuestions);
  $('cFamily').value = form.familyId; $('cFictional').checked = form.fictional;
  for (const key of Object.keys(REDACTIONS)) $('c-' + key).checked = form[key];
  if (!draft.narrative.trim()) { $('c-removeNarrative').disabled = true; } else $('c-removeNarrative').disabled = false;
  const envelope = buildEnvelope(draft, {...form, activityTags: draft.classification.activityTags, frictionTags: draft.classification.frictionTags}, {contributionId: contrib.id, createdAt: contrib.createdAt, confirmed: $('cConfirm').checked});
  contrib.envelope = envelope;
  $('cPreview').textContent = JSON.stringify(envelope, null, 2);
  const e = envelope.candidateEntry, p = e.process;
  const included = [
    ['Titel', e.title], ['Zusammenfassung', e.summary || '—'], ['Geltungsbereich', e.context.scope || '—'],
    ['Lokale Bedingungen', e.context.constraints.join(' · ') || '—'],
    ['Familie', e.classification.familyId ? tagLabel('families', e.classification.familyId) : '—'],
    ['Tätigkeiten', e.classification.activityTags.map(t => tagLabel('activityTags', t)).join(', ') || '—'],
    ['Auslöser / Ergebnis', `${p.trigger || '—'} → ${p.outcome || '—'}`], ['Verantwortung', p.owner || 'weggelassen oder leer'],
    ['Schritte', p.steps.map((s, i) => `${i + 1}. ${s.label} (${s.role || 'Rolle offen'}${s.system ? ', ' + s.system : ''})`).join(' · ') || '—'],
    ['Reibung', p.pain || 'weggelassen oder leer'], ['Häufigkeit', p.frequency || 'weggelassen oder leer'],
    ['Hypothese', p.opportunity.hypothesis || 'weggelassen oder leer'], ['Freie Erzählung', envelope.narrative ? 'enthalten' : 'nicht enthalten'],
    ['Offene Fragen', envelope.openQuestions.length + ''], ['Status', 'Prüfung ausstehend']
  ];
  replaceChildren($('cReadable'), h('dl', {}, included.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])), h('p', {class: 'micro'}, 'Nie enthalten: Zugangstoken, Server-Einstellungen, Browserdaten und Chatverläufe.'));
  const errors = library.status === 'ready' ? validateContribution(envelope, library.taxonomy) : ['Die Bibliothek mit den Kategorien ist nicht geladen; der Beitrag kann gerade nicht geprüft werden.'];
  replaceChildren($('cErrors'), errors.map(x => h('li', {}, x)));
  $('cDownload').setAttribute('aria-describedby', 'cErrors');
}
const C_FIELDS = {cTitle: 'title', cSummary: 'summary', cScope: 'scope', cConstraints: 'constraints', cQuestions: 'openQuestions'};
for (const [id, key] of Object.entries(C_FIELDS)) $(id).addEventListener('input', e => { contributionForm()[key] = e.target.value; if (key === 'title') contrib.titleTouched = true; renderContribution(); });
$('cFamily').onchange = e => { contributionForm().familyId = e.target.value; renderContribution(); };
$('cFictional').onchange = e => { contributionForm().fictional = e.target.checked; renderContribution(); };
$('cConfirm').onchange = () => renderContribution();
// A previous download message must not describe changed content.
$('contributionForm').addEventListener('input', () => { $('cResult').hidden = true; });
$('contributionForm').addEventListener('change', () => { $('cResult').hidden = true; });
$('cRedactions').addEventListener('change', e => { const key = e.target.id.replace('c-', ''); contributionForm()[key] = e.target.checked; renderContribution(); });
$('cDownload').onclick = () => {
  // Export exactly the envelope currently shown in the preview.
  const errors = library.status === 'ready' ? validateContribution(contrib.envelope, library.taxonomy) : ['Bibliothek nicht geladen.'];
  if (errors.length) { notify('Noch nicht bereit: ' + errors[0]); $('cErrors').querySelector('li') && $('cErrors').scrollIntoView({block: 'center'}); return; }
  const [json, md] = exportContribution(contrib.envelope, library.taxonomy);
  download(json.name, json.content, json.type);
  setTimeout(() => download(md.name, md.content, md.type), 300);
  const result = $('cResult');
  result.hidden = false;
  result.textContent = `Zwei Dateien heruntergeladen (${json.name}, ${md.name}). Status: Prüfung ausstehend. Es wurde nichts gesendet und nichts veröffentlicht. Nächster Schritt: Lass die Beschreibung von den Beteiligten fachlich prüfen und gib sie dann der Kuration, die über die Aufnahme entscheidet.`;
};

// ---- Learning ------------------------------------------------------------------------------------
const APPLY = {trigger: 'trigger', outcome: 'outcome', role: 'owner', activity: 'addStep'};
function renderLesson() {
  replaceChildren($('exerciseNav'), exercises.map((ex, i) => h('li', {}, h('button', {type: 'button', 'aria-current': i === lessonIndex ? 'step' : null, onclick: () => { lessonIndex = i; renderLesson(); $('exercise').querySelector('h2').focus(); }}, `${i + 1}. ${glossary[ex.concept].term}`))));
  const ex = exercises[lessonIndex], v = ex[lessonContext];
  const feedback = h('div', {class: 'feedback', role: 'status'});
  const options = v.options.map((o, j) => h('button', {type: 'button', class: 'answer', 'data-answer': String(j), onclick: e => {
    options.forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    replaceChildren(feedback, h('p', {class: o.correct ? 'right' : 'wrong'}, h('b', {}, o.correct ? 'Richtig. ' : 'Nicht ganz. '), o.why));
  }}, o.text));
  replaceChildren($('exercise'),
    h('p', {class: 'eyebrow'}, `ÜBUNG ${lessonIndex + 1} / ${exercises.length} · ${lessonContext === 'uni' ? 'HOCHSCHULE' : 'PIZZERIA'}`),
    h('h2', {tabindex: '-1'}, glossary[ex.concept].term),
    h('p', {}, glossary[ex.concept].text),
    h('p', {class: 'scenario'}, v.scenario),
    h('fieldset', {class: 'answers'}, h('legend', {}, v.question), options),
    feedback,
    h('div', {class: 'actions'},
      lessonIndex < exercises.length - 1 ? h('button', {type: 'button', onclick: () => { lessonIndex++; renderLesson(); $('exercise').querySelector('h2').focus(); }}, 'Nächste Übung') : null,
      h('button', {type: 'button', class: 'primary', onclick: () => applyConcept(ex.concept)}, 'In meinem Prozess anwenden →')));
}
function applyConcept(concept) {
  go('prozess/ablauf');
  if (APPLY[concept]) { setMode('direct'); $(APPLY[concept]).focus(); }
  else if (concept === 'handover' || concept === 'exception') selectTab('check');
  else { setMode('guided'); focusGuided(); }
}
document.querySelectorAll('input[name="lessonContext"]').forEach(r => r.onchange = e => { lessonContext = e.target.value; renderLesson(); });

// ---- Settings and optional live chat -------------------------------------------------------------
$('settingsBtn').onclick = () => $('settings').showModal();
$('applySettings').onclick = e => {
  const value = $('backend').value.trim();
  try {
    if (value) { const url = new URL(value); if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw Error(); }
    backend = value; token = $('accessToken').value;
    notify(backend ? 'Live-Server für diese Sitzung eingetragen. Gesendet wird nur, wenn du im Chat auf «Senden» klickst.' : 'Offline-Modus: kein Live-Server eingetragen.');
  } catch { e.preventDefault(); notify('Bitte eine HTTPS-URL oder einen lokalen Testserver eintragen.'); }
};
$('copyPrompt').onclick = async () => {
  try { await navigator.clipboard.writeText(prompt(draft.process)); notify('Prozess und Gesprächsanleitung kopiert.'); }
  catch { download(fileBase() + '-gespraech.txt', prompt(draft.process), 'text/plain'); notify('Zwischenablage nicht verfügbar; Textdatei heruntergeladen.'); }
};
$('chatForm').onsubmit = async e => {
  e.preventDefault();
  if (busy) return;
  if (!backend) return notify('Bitte zuerst unter Einstellungen einen Mistral-Server eintragen.');
  const question = $('chatInput').value.trim();
  if (!question) return;
  busy = true; $('sendChat').disabled = true; $('sendChat').textContent = 'Pietro denkt …';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(backend, {method: 'POST', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: JSON.stringify({process: draft.process, question, history: chatHistory.slice(-10)}), signal: controller.signal});
    if (!response.ok) throw Error('Server antwortet mit Status ' + response.status);
    const body = await response.json();
    if (typeof body.reply !== 'string') throw Error('Unerwartete Antwort');
    chatHistory.push({role: 'user', content: question}, {role: 'assistant', content: body.reply});
    for (const message of chatHistory.slice(-2)) $('chatLog').append(h('div', {class: 'message ' + message.role}, (message.role === 'user' ? 'Du: ' : 'Pietro (Mistral): ') + message.content));
    $('chatInput').value = '';
  } catch (error) { notify(error.name === 'AbortError' ? 'Zeitlimit erreicht. Es wurde keine Antwort übernommen.' : 'Mistral nicht erreichbar: ' + error.message); }
  finally { clearTimeout(timeout); busy = false; $('sendChat').disabled = false; $('sendChat').textContent = 'An Mistral senden'; }
};

// ---- Start ---------------------------------------------------------------------------------------
document.querySelectorAll('form:not([method="dialog"]):not(#chatForm)').forEach(f => f.addEventListener('submit', e => e.preventDefault()));
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

const loaded = draftStore.loadDraft();
if (loaded.status === 'ok') { draft = loaded.draft; savedAt = loaded.savedAt; guideState.stepsDone = draft.process.steps.length > 0; if (draft.process.steps.length) mode = 'direct'; }
else if (loaded.status !== 'empty') { storageProblem = loaded.status === 'corrupt' ? 'Gespeicherter Entwurf beschädigt' : 'Browser-Speicher nicht verfügbar'; setTimeout(() => notify(loaded.message), 50); }
setMode(mode);
renderAll();
renderLesson();
route();
loadLibrary();
