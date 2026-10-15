// Deterministic process map: SVG markup (all text escaped) plus a readable text alternative.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

const ROW = 130;
/** @param process v1 process  @param options {lens, highlight: Set<stepId>, idPrefix} */
export function mapSvg(process, {lens = process.lens, highlight = new Set(), idPrefix = 'map'} = {}) {
  const nodes = [{id: 'start', label: process.trigger || 'Auslöser offen', type: 'event'}, ...process.steps, {id: 'end', label: process.outcome || 'Ergebnis offen', type: 'event'}];
  const positions = new Map(nodes.map((n, i) => [n.id, {y: 65 + i * ROW}]));
  const edges = [['start', process.steps[0]?.id || 'end', '']];
  for (const s of process.steps) {
    if (s.type === 'decision') edges.push([s.id, s.yes, 'Ja'], [s.id, s.no, 'Nein']);
    else edges.push([s.id, s.next, '']);
  }
  const marker = `${idPrefix}-arrow`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${nodes.length * ROW}" role="img" aria-labelledby="${idPrefix}-title"><title id="${idPrefix}-title">Prozesskarte: ${esc(process.title)}. Eine Textfassung steht neben der Karte.</title><defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#50776c"/></marker></defs>`;
  edges.forEach(([a, b, label], i) => {
    const from = positions.get(a), to = positions.get(b);
    if (!from || !to) return;
    let path, tx, ty;
    if (to.y - from.y === ROW) { path = `M 330 ${from.y + 35} L 330 ${to.y - 38}`; tx = 345; ty = from.y + 62; }
    else {
      const right = label !== 'Nein';
      const side = right ? 535 + (i % 3) * 25 : 100 - (i % 3) * 25;
      const x = right ? 470 : 190;
      path = `M ${x} ${from.y} H ${side} V ${to.y} H ${x}`;
      tx = side + (right ? 8 : -35); ty = (from.y + to.y) / 2 - 7;
    }
    const back = to.y < from.y;
    svg += `<path d="${path}" fill="none" stroke="${back ? '#b5653a' : '#50776c'}" stroke-width="1.6" ${back ? 'stroke-dasharray="5 4" ' : ''}marker-end="url(#${marker})"/><text x="${tx}" y="${ty}" font-size="12" fill="#294e43">${label}</text>`;
  });
  process.steps.forEach((s, i) => positions.get(s.id).n = i + 1);
  for (const n of nodes) {
    const {y, n: number} = positions.get(n.id);
    const hot = highlight.has(n.id);
    const stroke = hot ? '#b5653a' : n.type === 'decision' ? '#c0a56d' : '#9bb7a9';
    const width = hot ? 3 : 1;
    if (n.type === 'decision') svg += `<path d="M 330 ${y - 45} L 480 ${y} L 330 ${y + 45} L 180 ${y} Z" fill="#f8ebcf" stroke="${stroke}" stroke-width="${width}"/>`;
    else svg += `<rect x="190" y="${y - 35}" width="280" height="70" rx="${n.type === 'event' ? 35 : 8}" fill="${n.type === 'event' ? '#e1eee5' : 'white'}" stroke="${stroke}" stroke-width="${width}"/>`;
    if (number) svg += `<text x="${n.type === 'decision' ? 200 : 202}" y="${y - 18}" font-size="10" fill="#176b61" font-family="system-ui">${number}</text>`;
    const label = n.label || 'Ohne Bezeichnung';
    const text = label.length > 37 ? label.slice(0, 34) + '…' : label;
    const sub = n.type === 'event' ? (n.id === 'start' ? 'Auslöser' : 'Ergebnis') : (lens === 'data' ? n.system || 'System offen' : n.role || 'Rolle offen');
    svg += `<text x="330" y="${y - 4}" text-anchor="middle" fill="#183a39" font-size="13" font-family="system-ui">${esc(text)}</text><text x="330" y="${y + 17}" text-anchor="middle" fill="#5e706a" font-size="10" font-family="system-ui">${esc(sub)}</text>`;
  }
  return svg + '</svg>';
}

/** Ordered text alternative: one entry per node with its outgoing connections spelled out. */
export function textAlternative(process) {
  const name = id => {
    if (id === 'end') return `Ende: ${process.outcome || 'Ergebnis offen'}`;
    const i = process.steps.findIndex(s => s.id === id);
    return i < 0 ? `fehlender Schritt ${id}` : `Schritt ${i + 1}`;
  };
  const items = [{id: 'start', title: `Start: ${process.trigger || 'Auslöser offen'}`, detail: `weiter zu ${name(process.steps[0]?.id || 'end')}`}];
  process.steps.forEach((s, i) => {
    const index = new Map(process.steps.map((x, j) => [x.id, j]));
    const arrow = target => name(target) + (index.has(target) && index.get(target) <= i ? ' (Rückweg)' : '');
    items.push({
      id: s.id,
      title: `${i + 1}. ${s.type === 'decision' ? 'Entscheidung' : 'Tätigkeit'}: ${s.label || 'ohne Bezeichnung'}`,
      detail: [`Rolle: ${s.role || 'offen'}`, s.system ? `System: ${s.system}` : '', s.type === 'decision' ? `Ja → ${arrow(s.yes)}; Nein → ${arrow(s.no)}` : `weiter zu ${arrow(s.next)}`].filter(Boolean).join(' · ')
    });
  });
  items.push({id: 'end', title: `Ende: ${process.outcome || 'Ergebnis offen'}`, detail: ''});
  return items;
}
