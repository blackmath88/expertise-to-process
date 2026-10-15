// Landing page demo. The "Für Einzelne" view runs the app's real modules on the prepared example;
// the "Für die Universität" view only counts what is in demo-institution.json (dummy data).
import {blank} from '../app/model.js';
import {h, replaceChildren} from '../app/lib/dom.js';
import {mapSvg, textAlternative} from '../app/lib/map.js';
import {reviewProcess} from '../app/lib/review.js';
import {blankExtras, createProposal, applyProposal, scriptedTurns} from '../app/lib/guidance.js';

const $ = id => document.getElementById(id);

// ---- Tabs ----
const tabs = ['person', 'uni', 'family'];
function select(name, focus = true) {
  for (const t of tabs) {
    $('tab-' + t).setAttribute('aria-selected', String(t === name));
    $('tab-' + t).tabIndex = t === name ? 0 : -1;
    $('panel-' + t).hidden = t !== name;
  }
  if (focus) $('tab-' + name).focus();
}
tabs.forEach((t, i) => {
  $('tab-' + t).onclick = () => select(t);
  $('tab-' + t).onkeydown = e => {
    const next = {ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1}[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length]);
  };
});

// ---- Für Einzelne: real app output on the prepared example ----
function personDemo() {
  let draft = {process: blank(), ...blankExtras()};
  for (const turn of scriptedTurns()) draft = applyProposal(draft, createProposal(turn.ops, {label: turn.label, source: 'scripted-example'}));
  const p = draft.process;
  $('personMap').innerHTML = mapSvg(p, {idPrefix: 'lena'});
  replaceChildren($('personMapText'), textAlternative(p).map(i => h('li', {}, h('b', {}, i.title), i.detail ? ' – ' + i.detail : '')));
  const review = reviewProcess(p, draft);
  $('heroMap').innerHTML = mapSvg(p, {idPrefix: 'hero'});
  const loop = review.questions.find(f => f.id.startsWith('q-loop'));
  const hyp = review.hypotheses[0];
  const handovers = review.facts.find(f => f.id === 'fact-handovers');
  replaceChildren($('heroNotes'), [[loop, 'q', 'Frage'], [hyp, 'h', 'Hypothese'], [handovers, 'f', 'Fakt']].filter(([f]) => f).map(([f, cls, label]) =>
    h('p', {class: 'hero-note'}, h('span', {class: 'tag ' + cls}, label), f.title, h('span', {class: 'ref'}, f.refs.filter(r => r.kind === 'step').slice(0, 2).map(r => r.id).join(' · ')))));
  const pick = (list, ids) => ids.map(id => list.find(f => f.id.startsWith(id))).filter(Boolean);
  const groups = [
    ['Gemeldete Fakten', 'fact', pick(review.facts, ['fact-loop', 'fact-duplicate'])],
    ['Offene Fragen', 'question', pick(review.questions, ['q-loop', 'q-handover', 'q-validated'])],
    ['Verbesserungshypothesen (ungeprüft)', 'hypothesis', review.hypotheses.slice(0, 2)]
  ];
  replaceChildren($('personCheck'), groups.map(([title, kind, items]) => h('div', {class: 'finding-group ' + kind},
    h('h4', {}, title),
    h('ul', {}, items.map(f => h('li', {}, h('b', {}, f.title), h('span', {}, ' ' + f.detail), f.refs.some(r => r.kind === 'step') ? h('span', {class: 'refs'}, ' Bezug: ' + f.refs.filter(r => r.kind === 'step').map(r => r.id).join(', ')) : null))))),
  h('p', {class: 'micro'}, `Auszug: ${review.facts.length} Fakten, ${review.questions.length} offene Fragen, ${review.hypotheses.length} Hypothesen – erzeugt von den Regeln der App, ohne KI.`));
}

// ---- Für die Universität: counts of the dummy dataset only ----
const REVIEW = {'not-reviewed': 'Beschrieben, nicht geprüft', 'pending-review': 'Prüfung ausstehend', 'reviewed': 'Fachlich geprüft'};
const EFFECT = {'untested': 'Wirkung nicht getestet', 'anecdotal': 'Erfahrungsberichte', 'measured': 'Wirkung gemessen'};
const AUTH = {'none': 'Keine Vorgabe', 'local-practice': 'Lokal vereinbarte Praxis', 'binding': 'Verbindliche Vorgabe'};

async function uniDemo() {
  let data;
  try {
    const response = await fetch(new URL('./demo-institution.json', import.meta.url));
    if (!response.ok) throw Error(String(response.status));
    data = await response.json();
  } catch {
    replaceChildren($('uniSummary'), 'Die Beispieldaten konnten nicht geladen werden. Bitte lade die Seite erneut.');
    replaceChildren($('familyIntro'), 'Die Beispieldaten konnten nicht geladen werden. Bitte lade die Seite erneut.');
    document.querySelectorAll('.view-btn').forEach(button => { button.disabled = true; });
    return;
  }
  const unit = id => data.units.find(u => u.id === id)?.label || id;
  const used = new Set(data.processes.map(p => p.unit));
  replaceChildren($('uniSummary'), h('b', {}, `${data.processes.length} Prozessbeschreibungen aus ${used.size} Einheiten`), ' – illustrative Dummy-Daten der fiktiven Universität Musterstadt.');

  // Matrix
  const head = h('tr', {}, h('th', {scope: 'col'}, 'Tätigkeitsmuster'), data.units.map(u => h('th', {scope: 'col'}, u.label)), h('th', {scope: 'col'}, 'Einheiten'));
  const rows = data.patterns.map(pat => {
    const inUnits = data.units.map(u => data.processes.filter(p => p.unit === u.id && p.tags.includes(pat.tag)));
    const spread = inUnits.filter(list => list.length).length;
    return h('tr', {},
      h('th', {scope: 'row'}, h('button', {type: 'button', class: 'pattern-btn', 'data-tag': pat.tag, 'aria-pressed': 'false', onclick: e => showPattern(pat, e.currentTarget)}, pat.label)),
      inUnits.map((list, i) => h('td', {}, list.length ? h('span', {class: 'dots', title: list.map(p => p.title).join(', ')}, h('span', {'aria-hidden': 'true'}, '●'.repeat(list.length)), h('span', {class: 'sr-only'}, `${list.length} in ${data.units[i].label}`)) : h('span', {class: 'none', 'aria-label': 'keine'}, '·'))),
      h('td', {class: 'spread'}, String(spread)));
  });
  replaceChildren($('matrix'), h('caption', {class: 'sr-only'}, 'Tätigkeitsmuster nach Einheit (Dummy-Daten)'), h('thead', {}, head), h('tbody', {}, rows));

  function showPattern(pat, button) {
    document.querySelectorAll('.pattern-btn').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    const list = data.processes.filter(p => p.tags.includes(pat.tag));
    replaceChildren($('patternDetail'),
      h('h4', {}, `«${pat.label}» in ${new Set(list.map(p => p.unit)).size} Einheiten`),
      pat.pattern ? h('p', {class: 'micro'}, `Dazu gibt es in der Bibliothek das Muster «${pat.pattern}».`) : h('p', {class: 'micro'}, 'Noch kein beschriebenes Muster – ein Kandidat für die Kuration.'),
      h('table', {class: 'local-table'}, h('thead', {}, h('tr', {}, h('th', {scope: 'col'}, 'Prozess'), h('th', {scope: 'col'}, 'Einheit'), h('th', {scope: 'col'}, 'Lokale Unterschiede'))),
        h('tbody', {}, list.map(p => h('tr', {}, h('td', {}, p.title), h('td', {}, unit(p.unit)), h('td', {}, p.local))))),
      h('p', {class: 'micro'}, 'Gemeinsam ist die Tätigkeit, nicht die Regel. Vor einer Übernahme: Welche Kriterien gelten bei uns, und wer legt sie fest?'));
  }
  showPattern(data.patterns[0], document.querySelector('.pattern-btn'));

  // Pipeline
  replaceChildren($('pipeline'), Object.entries(REVIEW).map(([key, label]) => {
    const list = data.processes.filter(p => p.review === key);
    return h('div', {class: 'stage ' + key}, h('b', {}, label), h('span', {class: 'count'}, String(list.length)), h('ul', {}, list.map(p => h('li', {}, p.title))));
  }));

  // Dimensions
  const dim = (title, map, key) => h('div', {class: 'dim'}, h('h4', {}, title), h('ul', {}, Object.entries(map).map(([k, label]) => h('li', {}, h('span', {}, label), h('b', {}, String(data.processes.filter(p => p[key] === k).length))))));
  replaceChildren($('dimensions'),
    dim('Fachliche Prüfung', REVIEW, 'review'), dim('Wirkung', EFFECT, 'effectiveness'), dim('Verbindlichkeit', AUTH, 'authority'),
    h('p', {class: 'micro'}, 'Geprüft heisst nicht wirksam, und wirksam heisst nicht verbindlich. Wirkung wird erst gemessen, wenn ein Versuch stattgefunden hat – deshalb steht hier überall «nicht getestet».'));

  familyDemo(data.family);

  // Questions
  replaceChildren($('questions'), data.processes.flatMap(p => p.openQuestions.map(q => h('li', {}, h('span', {}, q), h('span', {class: 'micro'}, ` · ${p.title}, ${unit(p.unit)}`)))));
}

// ---- Prozessfamilien (Zielbild): explanatory views only, nothing is submitted or merged ----
function familyDemo(family) {
  if (!family) return;
  const byId = id => family.versions.find(v => v.id === id);
  const base = family.versions.find(v => !v.parent);
  const variants = family.versions.filter(v => v.parent);
  replaceChildren($('familyIntro'),
    h('p', {}, h('b', {}, `Prozessfamilie «${family.title}»`), ` – eine Ausgangsbeschreibung und ${variants.length} lokale Varianten. Jede Variante hat ein verantwortliches Team, einen Geltungsbereich, eine eigene Version und einen Grund für die Anpassung.`));
  const card = v => h('article', {class: 'version-card' + (v.parent ? ' variant' : ' base')},
    h('p', {class: 'v-meta'}, h('span', {class: 'v-tag'}, v.version), v.parent ? ` · abgeleitet von ${byId(v.parent.id).title} ${v.parent.version}` : ' · Ausgangsbeschreibung'),
    h('h4', {}, v.title),
    h('dl', {}, h('dt', {}, 'Verantwortliches Team'), h('dd', {}, v.team), h('dt', {}, 'Geltungsbereich'), h('dd', {}, v.scope),
      v.reason ? [h('dt', {}, 'Grund für die Anpassung'), h('dd', {}, v.reason)] : null,
      h('dt', {}, 'Fachliche Prüfung'), h('dd', {}, v.review)));
  const views = {
    adapt: () => [
      h('p', {class: 'view-lead'}, 'Ein Team nimmt eine bestehende Beschreibung als Ausgangspunkt, passt sie an und übernimmt die Verantwortung für seinen Geltungsbereich. Die Herkunft bleibt sichtbar.'),
      h('div', {class: 'lineage'}, card(base), h('div', {class: 'lineage-children'}, variants.map(card))),
      h('h4', {}, `Entwicklung von «${base.title}»`),
      h('ol', {class: 'history'}, base.history.map(e => h('li', {}, h('span', {class: 'v-tag'}, e.version), ' ' + e.change))),
      h('p', {class: 'small muted'}, `Das Institut für Geografie hat von ${variants[0].parent.version} abgeleitet; die Ausgangsbeschreibung ist inzwischen bei ${base.version}. Die neuere Version wird nicht automatisch übernommen.`)
    ],
    diff: () => {
      const all = [];
      for (const v of family.versions) for (const st of v.steps) if (!all.includes(st.label)) all.push(st.label);
      const order = family.versions.map(v => v.steps.map(x => x.label));
      all.sort((a, b) => Math.min(...order.map(o => o.indexOf(a) < 0 ? 99 : o.indexOf(a))) - Math.min(...order.map(o => o.indexOf(b) < 0 ? 99 : o.indexOf(b))));
      return [
        h('p', {class: 'view-lead'}, 'Gemeinsame Schritte und begründete Unterschiede stehen nebeneinander. Eine Abweichung ist kein Mangel – sie hat einen Grund und eine Verantwortung.'),
        h('div', {class: 'family-mobile-comparison'}, all.map(label => h('article', {class: 'comparison-step'},
          h('h4', {}, label),
          h('dl', {}, family.versions.map(v => {
            const st = v.steps.find(x => x.label === label);
            return [h('dt', {}, v.team + ' · ' + v.version), h('dd', {class: st?.added ? 'added' : ''},
              st ? (st.added ? 'Ergänzt' : 'Gemeinsam') + (st.note ? ' · ' + st.note : '') : 'Nicht enthalten')];
          }))))),
        h('div', {class: 'matrix-wrap family-desktop-comparison'}, h('table', {class: 'diff-table'},
          h('caption', {class: 'sr-only'}, 'Schritte der Varianten im Vergleich (fiktiv)'),
          h('thead', {}, h('tr', {}, h('th', {scope: 'col'}, 'Schritt'), family.versions.map(v => h('th', {scope: 'col'}, v.team, h('span', {class: 'v-tag'}, v.version))))),
          h('tbody', {}, all.map(label => h('tr', {}, h('th', {scope: 'row'}, label), family.versions.map(v => {
            const st = v.steps.find(x => x.label === label);
            if (!st) return h('td', {class: 'absent'}, h('span', {'aria-hidden': 'true'}, '–'), h('span', {class: 'sr-only'}, 'nicht enthalten'));
            return h('td', {class: st.added ? 'added' : 'shared'}, st.added ? 'Ergänzt' : 'Gemeinsam', st.note ? h('span', {class: 'small muted'}, ' · ' + st.note) : null);
          })))))),
        h('ul', {class: 'reasons'}, variants.map(v => h('li', {}, h('b', {}, v.team + ': '), v.reason)))
      ];
    },
    propose: () => {
      const p = family.proposal;
      return [
        h('p', {class: 'view-lead'}, 'Eine Verbesserung aus einer Variante kann anderen helfen. Sie wird vorgeschlagen – nicht verteilt.'),
        h('div', {class: 'proposal'}, h('p', {class: 'v-meta'}, `Vorschlag aus «${byId(p.from).title}» ${byId(p.from).version}`), h('h4', {}, p.title), h('p', {}, p.change), h('p', {class: 'small muted'}, 'Begründung: ' + p.why)),
        h('p', {class: 'small muted'}, 'Ein Vorschlag ändert keine Variante. Jedes verantwortliche Team entscheidet selbst, ob und wie es ihn übernimmt.')
      ];
    },
    adopt: () => [
      h('p', {class: 'view-lead'}, 'Wer eine Änderung übernimmt, erstellt eine neue Version seiner Variante. Diese braucht ihre eigene fachliche Prüfung – Status und Freigaben werden nicht geerbt.'),
      h('ul', {class: 'decisions'}, family.proposal.decisions.map(d => h('li', {}, h('h4', {}, byId(d.target).team), h('span', {class: 'status ' + (d.status.startsWith('Bereits') ? 'done' : 'pending')}, d.status), h('p', {}, d.detail)))),
      h('p', {class: 'small muted'}, 'Gemeinsame Standards wären eine eigene, begründete Entscheidung der zuständigen Stellen – nicht die Folge eines Vorschlags.')
    ]
  };
  const show = view => {
    document.querySelectorAll('.view-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    replaceChildren($('familyView'), views[view]());
  };
  document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
  show('adapt');
}

personDemo();
uniDemo();
