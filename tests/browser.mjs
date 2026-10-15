// End-to-end browser checks. The app is served from a copy of docs/ below an arbitrary repository
// prefix, as on GitHub Pages. All AI/provider traffic is mocked; nothing leaves the machine.
import {chromium} from 'playwright';
import {once} from 'node:events';
import http from 'node:http';
import {mkdir, mkdtemp, rm, cp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, extname, sep} from 'node:path';
import assert from 'node:assert/strict';

const PREFIX = '/some-org-pietro-copy';
const temp = await mkdtemp(join(tmpdir(), 'pietro-'));
const site = join(temp, 'site');
await cp(new URL('../docs/', import.meta.url), join(site, PREFIX.slice(1)), {recursive: true});
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json'};
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = resolve(site, '.' + path + (path.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(site + sep)) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, {'Content-Type': mime[extname(file)] || 'application/octet-stream'}); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
const appUrl = origin + PREFIX + '/app/';
const shots = 'test-results';
await mkdir(shots, {recursive: true});

let browser;
const results = [];
const step = async (name, fn) => { await fn(); results.push(name); console.log('  ✓ ' + name); };
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
async function readDownload(page, action) {
  const [download] = await Promise.all([page.waitForEvent('download'), action()]);
  const file = join(temp, download.suggestedFilename());
  await download.saveAs(file);
  return {name: download.suggestedFilename(), file, text: await readFile(file, 'utf8')};
}

try {
  browser = await chromium.launch({headless: true, ...(process.env.PW_CHROMIUM_PATH ? {executablePath: process.env.PW_CHROMIUM_PATH} : {})});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => requests.push(r.url()));
  page.on('dialog', d => d.accept());

  await step('app and data load below an arbitrary repository prefix', async () => {
    await page.goto(appUrl);
    await page.screenshot({path: `${shots}/desktop-start.png`});
    assert.match(await page.textContent('.demo-band'), /Universität Musterstadt ist erfunden/);
    await page.click('[data-route="bibliothek"]');
    await page.locator('.lib-card').first().waitFor();
    assert.equal(await page.locator('.lib-card').count(), 5);
    assert.ok(requests.some(u => u === appUrl + 'data/library-index.json'));
    assert.ok(requests.some(u => u === appUrl + 'data/processes/funding.json'));
  });

  await step('landing page: story, science, dummy-data demo for individual and university', async () => {
    const landing = origin + PREFIX + '/';
    await page.goto(landing);
    await page.locator('#personMap svg').waitFor();
    assert.match(await page.textContent('#personCheck'), /Rückweg/);
    assert.match(await page.textContent('#personCheck'), /ohne KI/);
    assert.equal(await page.locator('#wissenschaft article').count(), 7);
    assert.equal(await page.locator('.phases > li').count(), 3);
    const journey = await page.textContent('#weg');
    for (const phase of ['Entdecken und verstehen', 'Teilen und verbinden', 'Gezielt verbessern']) assert.ok(journey.includes(phase), phase);
    assert.match(await page.textContent('#technik'), /KI-unterstützte Wissensbasis[\s\S]*Kontextbezogene Verbesserungshilfe/);
    assert.match(await page.textContent('#technik'), /keine bestimmte KI-Ausbaustufe/);
    for (const chip of ['Heute in der Demo', 'Nächster Pilot', 'Zielbild']) assert.ok((await page.textContent('#stand')).includes(chip), chip);
    const pilot = await page.textContent('#pilot');
    assert.match(pilot, /Zwölf Wochen, drei freiwillige Teams/);
    assert.match(pilot, /nicht\s+zugesagt/);
    assert.doesNotMatch(await page.textContent('main'), /am wirksamsten|für alle nutzbar/);
    const anchors = await page.$$eval('.page-nav a', as => as.map(a => a.getAttribute('href')));
    for (const href of anchors) assert.equal(await page.locator(href).count(), 1, 'anchor ' + href);
    await page.screenshot({path: `${shots}/desktop-landing.png`, fullPage: true});
    await page.click('#tab-uni');
    await page.locator('#matrix tbody tr').first().waitFor();
    assert.match(await page.textContent('#uniSummary'), /12 Prozessbeschreibungen aus 5 Einheiten/);
    assert.match(await page.textContent('#patternDetail'), /Vollständigkeit prüfen/);
    await page.click('.pattern-btn[data-tag="explicit-handover"]');
    assert.match(await page.textContent('#patternDetail'), /Übergabe mit Verantwortung/);
    const text = await page.textContent('#panel-uni');
    assert.doesNotMatch(text, /\d+\s*%|CHF|Stunden|gespart|Einsparung von/);
    await page.screenshot({path: `${shots}/desktop-landing-uni.png`, fullPage: true});
    await page.click('#tab-family');
    assert.match(await page.textContent('#panel-family'), /Zielbild · fiktive Illustration/);
    assert.match(await page.textContent('#panel-family'), /keine\s+Versionsverwaltung/);
    const fam = await page.textContent('#familyView');
    assert.match(fam, /Sekretariat Institut für Geografie/);
    assert.match(fam, /Raumverwaltung/);
    assert.match(fam, /abgeleitet von .* v2/);
    await page.click('.view-btn[data-view="diff"]');
    assert.match(await page.textContent('#familyView'), /Raumfreigabe einholen[\s\S]*Übersetzung prüfen/);
    assert.ok(await page.locator('.diff-table td.added').count() >= 2);
    await page.click('.view-btn[data-view="propose"]');
    assert.match(await page.textContent('#familyView'), /vorgeschlagen – nicht verteilt/);
    await page.click('.view-btn[data-view="adopt"]');
    assert.match(await page.textContent('#familyView'), /nicht geerbt/);
    assert.equal(await page.getAttribute('.view-btn[data-view="adopt"]', 'aria-pressed'), 'true');
    await page.screenshot({path: `${shots}/desktop-landing-family.png`, fullPage: true});
    await page.focus('#tab-family');
    await page.keyboard.press('Home');
    assert.equal(await page.getAttribute('#tab-person', 'aria-selected'), 'true');
    await page.click('#tab-uni');
    await page.focus('#tab-uni');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.getAttribute('#tab-person', 'aria-selected'), 'true');
    await page.setViewportSize({width: 390, height: 844});
    assert.ok(await noOverflow(page), 'landing overflow at 390px');
    await page.screenshot({path: `${shots}/mobile-landing.png`, fullPage: true});
    await page.click('#tab-uni');
    assert.ok(await noOverflow(page), 'landing uni overflow at 390px');
    await page.screenshot({path: `${shots}/mobile-landing-uni.png`, fullPage: true});
    await page.click('#tab-family');
    await page.click('.view-btn[data-view="diff"]');
    assert.ok(await noOverflow(page), 'landing family overflow at 390px');
    assert.equal(await page.locator('.family-desktop-comparison').isVisible(), false);
    assert.equal(await page.locator('.family-mobile-comparison').isVisible(), true);
    assert.match(await page.textContent('.family-mobile-comparison'), /Raumfreigabe einholen[\s\S]*Übersetzung prüfen/);
    assert.ok(await page.locator('.comparison-step dd.added').count() >= 2);
    for (const width of [320, 640]) {
      await page.setViewportSize({width, height: 844});
      assert.ok(await noOverflow(page), 'family comparison overflow at ' + width);
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: `${shots}/mobile-landing-family.png`, fullPage: true});
    await page.setViewportSize({width: 1440, height: 1000});
    await page.click('.site-header a:has-text("App öffnen")');
    await page.locator('#entryExample').waitFor();
    assert.equal(page.url(), appUrl);
  });

  await step('learning: decision vs activity is explained for each answer', async () => {
    await page.click('[data-route="lernen"]');
    await page.click('#exerciseNav button:has-text("Entscheidung")');
    await page.click('#exercise [data-answer="0"]');
    assert.match(await page.textContent('#exercise .feedback'), /Nicht ganz.*Tätigkeit.*Verzweigungspunkt/s);
    await page.click('#exercise [data-answer="1"]');
    assert.match(await page.textContent('#exercise .feedback'), /Richtig.*teilt den Weg/s);
    await page.check('input[value="pizza"]');
    assert.match(await page.textContent('#exercise'), /Sonderwunsch/);
    await page.screenshot({path: `${shots}/desktop-learn.png`});
  });

  await step('scripted example: accept, edit, reject and undo do what the preview says', async () => {
    await page.click('.brand');
    await page.click('#entryExample');
    await page.locator('#proposalCard [data-action="accept"]').waitFor();
    assert.match(await page.textContent('#scriptBanner'), /keine KI/);
    await page.click('#proposalCard [data-action="accept"]'); // frame
    assert.equal(await page.textContent('#draftHeading'), 'Spesen nach einer Dienstreise abrechnen');
    await page.click('#proposalCard [data-action="edit"]');
    await page.locator('#proposalCard .proposal-edit input').first().fill('Belege zusammentragen');
    assert.match(await page.textContent('#proposalCard .preview-lines'), /«Belege zusammentragen»/);
    await page.click('#proposalCard [data-action="accept"]'); // edited steps
    assert.match(await page.textContent('#mapText'), /Belege zusammentragen/);
    await page.click('#proposalCard [data-action="accept"]'); // decision + loop
    await page.click('#proposalCard [data-action="accept"]'); // further steps
    assert.equal(await page.locator('#mapText li').count(), 8);
    await page.click('#proposalCard [data-action="reject"]'); // friction rejected
    assert.equal(await page.inputValue('#pain'), '');
    assert.match(await page.textContent('#undoBtn'), /Weitere Schritte/);
    await page.click('#undoBtn');
    assert.equal(await page.locator('#mapText li').count(), 6);
    assert.match(await page.textContent('#mapText'), /Rückweg/);
  });

  await step('correct the map directly; text alternative follows', async () => {
    await page.click('.narrative summary');
    await page.fill('#narrative', 'GEHEIM-NARRATIV mit Details');
    await page.click('#modeDirect');
    await page.fill('.step[data-id="s1"] [data-field="role"]', 'Mitarbeitende');
    assert.match(await page.textContent('#mapText'), /Rolle: Mitarbeitende/);
    assert.ok(await page.locator('#mapContainer svg').count() === 1);
    await page.screenshot({path: `${shots}/desktop-workbench.png`, fullPage: true});
  });

  await step('process check cites steps, keeps unknowns open and exports a report', async () => {
    await page.click('#tab-check');
    const questions = await page.textContent('#questionsList');
    assert.match(questions, /Rückweg/);
    assert.match(questions, /Wie häufig/);
    assert.match(await page.textContent('#hypothesesList'), /Kriterien früher sichtbar/);
    await page.click('#questionsList .ref:has-text("s4")');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.step')?.dataset.id), 's4');
    await page.click('#tab-check');
    const report = await readDownload(page, () => page.click('#exportReport'));
    assert.match(report.text, /## Offene Fragen[\s\S]*s4/);
    await page.screenshot({path: `${shots}/desktop-check.png`, fullPage: true});
  });

  await step('comparison: keyword tags as proposal, related entries share the completeness pattern', async () => {
    await page.click('#tab-vergleich');
    await page.click('#suggestTags');
    assert.match(await page.textContent('#tagProposal'), /Stichwortregel – keine KI/);
    await page.click('#tagProposal [data-action="accept"]');
    await page.selectOption('#ownFamily', 'finanzen');
    const related = await page.textContent('#relatedList');
    assert.match(related, /Neue Mitarbeitende aufnehmen/);
    assert.match(related, /Forschungsförderungsantrag/);
    await page.click('#relatedList li:has-text("Neue Mitarbeitende") button');
    const cmp = await page.textContent('#ownComparison');
    assert.match(cmp, /Vollständigkeit prüfen/);
    assert.match(cmp, /keine inhaltliche oder semantische Analyse/);
    await page.screenshot({path: `${shots}/desktop-compare.png`, fullPage: true});
  });

  await step('contribution: pending, previewed fields only, no token or narrative', async () => {
    await page.click('#settingsBtn');
    await page.fill('#accessToken', 'tok-SECRET-123');
    await page.click('#applySettings');
    await page.click('#tab-mitnehmen');
    await page.fill('#cSummary', 'Spesen nach Reisen abrechnen.');
    await page.fill('#cScope', 'Fiktives Institut');
    await page.fill('#cConstraints', 'Belege innert 30 Tagen');
    await page.selectOption('#cFamily', 'finanzen');
    await page.click('#cDownload');
    assert.match(await page.textContent('#cErrors'), /bestätige/);
    await page.check('#cConfirm');
    assert.equal(await page.locator('#cErrors li').count(), 0);
    const preview = await page.textContent('#cPreview');
    const json = await readDownload(page, () => page.click('#cDownload'));
    assert.equal(json.text, preview, 'downloaded JSON equals preview');
    const env = JSON.parse(json.text);
    assert.equal(env.status, 'pending-review');
    assert.equal(env.candidateEntry.review.status, 'pending-review');
    assert.equal(env.narrative, undefined);
    for (const secret of ['tok-SECRET', 'GEHEIM', 'example.org']) assert.ok(!json.text.includes(secret), secret);
    const result = await page.textContent('#cResult');
    assert.match(result, /Prüfung ausstehend/);
    assert.doesNotMatch(result, /erfolgreich|wurde (eingereicht|veröffentlicht|freigegeben)/);
    await page.screenshot({path: `${shots}/desktop-contribute.png`, fullPage: true});
  });

  await step('personal export/import round-trips; invalid import leaves the draft intact', async () => {
    const exported = await readDownload(page, () => page.click('#exportJson'));
    assert.equal(JSON.parse(exported.text).version, 1);
    const bad = join(temp, 'bad.json');
    await writeFile(bad, JSON.stringify({version: 1, steps: [{id: 'x'}]}));
    await page.setInputFiles('#importFile', bad);
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Import fehlgeschlagen'));
    assert.equal(await page.textContent('#draftHeading'), 'Spesen nach einer Dienstreise abrechnen');
    await page.setInputFiles('#importFile', exported.file);
    await page.click('#confirmActions button:has-text("Ersetzen")');
    assert.equal(await page.textContent('#draftHeading'), 'Spesen nach einer Dienstreise abrechnen');
    assert.equal(await page.locator('#mapText li').count(), 6);
  });

  await step('imported markup is rendered as text, never executed', async () => {
    const evil = JSON.parse(await readFile(new URL('../docs/app/data/processes/event.json', import.meta.url), 'utf8')).process;
    evil.title = '<img src=x onerror="window.__xss=1">';
    evil.steps[0].label = '<script>window.__xss=2</script>';
    evil.pain = '<b onmouseover="window.__xss=3">x</b>';
    const file = join(temp, 'evil.json');
    await writeFile(file, JSON.stringify(evil));
    await page.setInputFiles('#importFile', file);
    await page.click('#confirmActions button:has-text("Ersetzen")');
    // The import resolves asynchronously after the dialog closes; wait for it instead of racing it.
    await page.waitForFunction(title => document.getElementById('draftHeading').textContent === title, evil.title);
    assert.equal(await page.textContent('#draftHeading'), evil.title);
    for (const tab of ['#tab-ablauf', '#tab-check', '#tab-mitnehmen']) await page.click(tab);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('img[src="x"], script:has-text("__xss")').count(), 0);
    await page.click('#undoBtn');
    assert.equal(await page.textContent('#draftHeading'), 'Spesen nach einer Dienstreise abrechnen');
  });

  await step('library: search, filter, empty state, detail and comparison of onboarding vs funding', async () => {
    await page.click('[data-route="bibliothek"]');
    await page.fill('#libSearch', 'raumfahrt');
    assert.match(await page.textContent('#libStatus'), /Keine Einträge gefunden/);
    await page.click('#libStatus button');
    await page.selectOption('#libFamily', 'forschung');
    assert.equal(await page.locator('.lib-card').count(), 1);
    await page.selectOption('#libFamily', '');
    await page.selectOption('#libKind', 'pattern');
    assert.equal(await page.locator('.lib-card').count(), 2);
    await page.selectOption('#libKind', '');
    await page.screenshot({path: `${shots}/desktop-library.png`, fullPage: true});
    await page.click('.lib-card a:has-text("Neue Mitarbeitende")');
    await page.locator('#libDetailTitle').waitFor();
    const detail = await page.textContent('#libDetail');
    for (const text of ['Nicht fachlich geprüft', 'Wirkung nicht getestet', 'Keine verbindliche Vorgabe', 'Fiktiv', 'Offene Fragen', 'Vollständigkeit vor der Übergabe prüfen']) assert.ok(detail.includes(text), text);
    await page.selectOption('#compareWith', 'funding');
    await page.click('#libDetail .inline-form button');
    const cmp = await page.textContent('#libComparison');
    assert.match(cmp, /Gemeinsame wiederverwendbare Muster[\s\S]*Vollständigkeit vor der Übergabe prüfen/);
    assert.match(cmp, /Bankverbindung/);
    assert.match(cmp, /Datenmanagementplan/);
    await page.screenshot({path: `${shots}/desktop-library-detail.png`, fullPage: true});
  });

  await step('opening an example never silently erases the draft', async () => {
    await page.click('#useAsDraft');
    assert.match(await page.textContent('#confirmText'), /Spesen nach einer Dienstreise/);
    await page.click('#confirmActions button:has-text("Abbrechen")');
    assert.equal(await page.textContent('#draftHeading'), 'Spesen nach einer Dienstreise abrechnen');
    await page.click('#useAsDraft');
    await page.click('#confirmActions button:has-text("Ersetzen")');
    await page.locator('#view-prozess:not([hidden])').waitFor();
    assert.equal(await page.textContent('#draftHeading'), 'Neue Mitarbeitende aufnehmen');
    assert.match(await page.textContent('#draftStatus'), /Kopie von/);
    await page.click('#undoBtn');
    assert.equal(await page.textContent('#draftHeading'), 'Spesen nach einer Dienstreise abrechnen');
  });

  await step('explicit local save survives reload; deletion works', async () => {
    await page.click('#saveDraft');
    assert.match(await page.textContent('#draftStatus'), /gespeichert/);
    await page.reload();
    await page.click('[data-route="prozess"]');
    assert.equal(await page.textContent('#draftHeading'), 'Spesen nach einer Dienstreise abrechnen');
    await page.click('#tab-mitnehmen');
    await page.click('#deleteDraft');
    await page.click('#confirmActions button:has-text("Löschen")');
    await page.reload();
    await page.click('[data-route="prozess"]');
    assert.equal(await page.textContent('#draftHeading'), 'Mein Prozess');
  });

  await step('manual draft without credentials via guided questions', async () => {
    await page.click('#modeGuided');
    await page.fill('#g-value', 'Raum für ein Seminar buchen');
    await page.click('#questionCard button[type="submit"]');
    assert.match(await page.textContent('#proposalCard'), /Prozessname: «Mein Prozess» → «Raum für ein Seminar buchen»/);
    await page.click('#proposalCard [data-action="accept"]');
    await page.click('#questionCard button:has-text("Überspringen")'); // trigger
    await page.click('#questionCard button:has-text("Überspringen")'); // outcome
    await page.click('#questionCard button:has-text("Überspringen")'); // owner
    await page.fill('#g-label', 'Raum anfragen');
    await page.fill('#g-role', 'Sekretariat');
    await page.click('#questionCard button[type="submit"]');
    await page.click('#proposalCard [data-action="accept"]');
    assert.match(await page.textContent('#mapText'), /Raum anfragen/);
  });

  await step('keyboard: tabs with arrow keys, visible focus, every control labelled', async () => {
    await page.focus('#tab-ablauf');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getAttribute('#tab-check', 'aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-check');
    await page.keyboard.press('End');
    assert.equal(await page.getAttribute('#tab-mitnehmen', 'aria-selected'), 'true');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert.notEqual(outline, 'none');
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea, button')].filter(el => el.offsetParent && !(el.labels?.length || el.getAttribute('aria-label') || el.textContent.trim())).map(el => el.id || el.outerHTML.slice(0, 60)));
    assert.deepEqual(unlabelled, []);
  });

  await step('offline mode makes no requests outside the site', async () => {
    const outside = requests.filter(u => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    assert.deepEqual(outside, []);
  });

  await step('optional live chat (mocked provider) stays separate from the draft', async () => {
    await page.click('#settingsBtn');
    await page.fill('#backend', 'https://example.org/api/chat');
    await page.click('#applySettings');
    let body;
    await page.route('https://example.org/api/chat', r => { body = JSON.parse(r.request().postData()); r.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify({reply: 'Welche Rolle prüft?'})}); });
    await page.click('#tab-mitnehmen');
    await page.click('summary:has-text("Live-Gespräch")');
    const before = await page.textContent('#mapText');
    await page.fill('#chatInput', 'Was fehlt?');
    await page.click('#sendChat');
    await page.locator('.message.assistant').waitFor();
    assert.equal(body.question, 'Was fehlt?');
    assert.equal(await page.textContent('#mapText'), before);
  });

  await step('mobile 390px: stacked layout, no page-level horizontal overflow', async () => {
    await page.setViewportSize({width: 390, height: 844});
    for (const [hash, name] of [['start', 'start'], ['lernen', 'learn'], ['prozess/ablauf', 'workbench'], ['prozess/check', 'check'], ['prozess/mitnehmen', 'contribute'], ['bibliothek', 'library'], ['bibliothek/funding', 'library-detail']]) {
      await page.goto(appUrl + '#' + hash);
      await page.waitForTimeout(150);
      assert.ok(await noOverflow(page), 'overflow in ' + hash);
      assert.ok(await page.locator('.demo-band').isVisible(), 'fictional notice visible in ' + hash);
      await page.screenshot({path: `${shots}/mobile-${name}.png`, fullPage: true});
    }
    await page.goto(appUrl + '#prozess/vergleich');
    assert.ok(await noOverflow(page), 'overflow in vergleich');
    const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.workbench')).gridTemplateColumns.split(' ').length);
    assert.equal(cols, 1);
  });

  await step('broken library fetch does not break personal editing', async () => {
    const broken = await context.newPage();
    const brokenErrors = [];
    broken.on('pageerror', e => brokenErrors.push(e.message));
    await broken.route('**/data/library-index.json', r => r.fulfill({status: 500, body: 'error'}));
    await broken.goto(appUrl + '#bibliothek');
    await broken.locator('.error-box').waitFor();
    assert.match(await broken.textContent('.error-box'), /nicht betroffen/);
    await broken.click('[data-route="prozess"]');
    await broken.click('#modeDirect');
    await broken.click('#addStep');
    await broken.fill('.step [data-field="label"]', 'Weiter möglich');
    assert.match(await broken.textContent('#mapText'), /Weiter möglich/);
    await broken.click('#tab-vergleich');
    assert.match(await broken.textContent('#relatedStatus'), /nicht verfügbar/);
    await broken.screenshot({path: `${shots}/desktop-library-error.png`});
    assert.deepEqual(brokenErrors, []);
    await broken.close();
  });

  const relevant = errors.filter(e => !/Failed to load resource/.test(e));
  assert.deepEqual(relevant, []);
  console.log(`PASS: ${results.length} browser checks (provider traffic mocked; no live AI call). Screenshots in ${shots}/.`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(r => server.close(r));
  await rm(temp, {recursive: true, force: true});
}
