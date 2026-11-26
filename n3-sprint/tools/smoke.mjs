#!/usr/bin/env node
// Smoke test for the front end, run without a browser.
//   node tools/smoke.mjs                 # uses dist/data
//   node tools/smoke.mjs --data /tmp/x   # load data/*.js from another directory
//   node tools/smoke.mjs --ruby /tmp/y   # load ruby/*.js (furigana) from another directory
// Runs the scripts of index.html in a sandbox with a tiny DOM stub. Bank files are loaded
// on demand: the stub's document.head.appendChild(<script>) reads the file from disk and
// fires onload/onerror asynchronously, like a browser. Checks on-demand loading, then
// scheduling, session building, mock assembly, migration and that every page renders
// without throwing or printing "undefined"/"NaN".
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {dist} from './load.mjs';

const argData = process.argv.indexOf('--data');
const dataDir = argData > 0 ? path.resolve(process.argv[argData + 1]) : path.join(dist, 'data');
const argRuby = process.argv.indexOf('--ruby');
const rubyDir = argRuby > 0 ? path.resolve(process.argv[argRuby + 1]) : path.join(dist, 'ruby');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const fileFor = src => (src.startsWith('data/') ? path.join(dataDir, src.slice(5))
  : src.startsWith('ruby/') ? path.join(rubyDir, src.slice(5)) : path.join(dist, src));
const isBankFile = src => /^(data|ruby)\//.test(src) || src === 'knowledge.js' || src === 'reading.js';

let failures = 0;
const check = (ok, label) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + label);
  if (!ok) failures++;
};
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

function element() {
  return {
    innerHTML: '', textContent: '', value: '', dataset: {}, style: {},
    classList: {toggle() {}, add() {}, remove() {}},
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return ''; },
    querySelector: () => null, querySelectorAll: () => [], focus() {}, closest: () => null,
    scrollIntoView() {}, append() {}, remove() {}, click() {}
  };
}

// opts.hash: initial location.hash; opts.fail: Set of srcs that 404; opts.hold: Set of srcs
// whose load waits until release(src) is called; opts.quiet hides expected console.error.
function sandbox(storage = {}, {hash = '', fail = new Set(), hold = new Set(), quiet = false} = {}) {
  const store = {...storage};
  const elements = {};
  const requests = [];   // every dynamically requested src, in order
  const held = new Map();
  let context;
  const finishLoad = (el, src) => {
    const file = fileFor(src);
    if (fail.has(src) || !fs.existsSync(file)) return el.onerror?.({type: 'error'});
    try { vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: src}); }
    catch (error) { console.log('  script error in ' + src + ': ' + error.message); }
    el.onload?.({type: 'load'});
  };
  const head = element();
  head.appendChild = el => {
    const src = el.src;
    requests.push(src);
    if (hold.has(src)) held.set(src, () => finishLoad(el, src));
    else setImmediate(() => finishLoad(el, src));
    return el;
  };
  context = {
    console: quiet ? {...console, error() {}} : console,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    navigator: {userAgent: 'node'},
    location: {hash},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      getElementById: id => (elements[id] ||= element()),
      querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, createElement: element, body: element(), head, hidden: false
    },
    window: {addEventListener() {}, scrollTo() {}, scrollY: 0},
    alert() {}, confirm: () => true
  };
  context.globalThis = context;
  vm.createContext(context);
  const skipped = [];
  for (const src of scripts) {
    const file = fileFor(src);
    if (!fs.existsSync(file)) { skipped.push(src); continue; }
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: src});
  }
  const release = src => { const go = held.get(src); held.delete(src); hold.delete(src); go?.(); };
  const bankRequests = () => requests.filter(isBankFile);
  const dataRequests = () => requests.filter(r => !r.startsWith('ruby/'));
  return {context, store, elements, skipped, requests, bankRequests, dataRequests, release, fail};
}

const allFiles = ctx => ctx.Bank.catalog.files.map(f => f.file);
const filesOfIds = (ctx, ids) => [...new Set(ids.map(id => ctx.App.byId.get(id).file))].sort();
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

// ---------- on-demand loading ----------
{
  const sb = sandbox();
  const {App: A, Bank} = sb.context;
  await flush();
  check(scripts.includes('manifest.js') && !scripts.some(s => isBankFile(s) && s !== 'ruby/instructions.js'),
    'index.html loads manifest.js and no bank files');
  check(sb.bankRequests().length === 0 && Bank.questions.length === 0 && Bank.notes.length === 0,
    'start: no bank file loaded, only the index');
  check(/題庫共 \d+ 題/.test(sb.elements.app.innerHTML) && A.byId.size >= 100, `home renders from the index (${A.byId.size} questions)`);
  check(A.notes.length > 0 && /佛腳筆記<\/b><small>\d+ 則/.test(sb.elements.app.innerHTML), 'note count comes from the index');

  // Drill of one type loads only files holding that type (plus their furigana).
  A.practice.startDrill('vocab', '漢字讀音', 10);
  sb.context.location.hash = '#practice/drill';
  await A.render();
  const typeFiles = Bank.catalog.files.filter(f => f.questions.some(q => q.type === '漢字讀音')).map(f => f.file);
  const drillIds = sb.context.Store.state.sessions.drill.ids;
  check(sb.dataRequests().every(f => typeFiles.includes(f)) && sameSet(sb.dataRequests(), filesOfIds(sb.context, drillIds)),
    `drill loads only its type's files: ${sb.dataRequests().join(', ')}`);
  check(sb.requests.filter(r => r.startsWith('ruby/')).every(r => typeFiles.map(f => 'ruby/' + path.basename(f)).includes(r)) &&
    sb.requests.some(r => r.startsWith('ruby/')), 'furigana on: matching ruby files load with them');
  check(/questionPanel/.test(sb.elements.app.innerHTML), 'drill question renders after loading');
}

// Today's sprint loads the files of the chosen questions only.
let sprintStore;
{
  const sb = sandbox();
  const {App: A, Bank, Store} = sb.context;
  await flush();
  const prepared = A.practice.prepareDaily();
  A.practice.startDaily();
  check(sameSet(Store.state.sessions.daily.ids, prepared), 'start uses the sprint prepared while home was idle');
  sb.context.location.hash = '#practice/daily';
  await A.render();
  const ids = Store.state.sessions.daily.ids;
  check(sameSet(sb.dataRequests(), filesOfIds(sb.context, ids)), `daily sprint loads ${sb.dataRequests().length} files for ${ids.length} questions`);
  check(sb.dataRequests().length < allFiles(sb.context).length, 'daily sprint does not load the whole bank');
  check(/questionPanel/.test(sb.elements.app.innerHTML), 'daily sprint renders');
  A.actions.answer({dataset: {pos: '0'}});
  sprintStore = {...sb.store};
}

// Reload in the middle of a session: the session's files load before it draws.
{
  const sb = sandbox(sprintStore, {hash: '#practice/daily'});
  await flush();
  const ids = sb.context.Store.state.sessions.daily.ids;
  check(/questionPanel|feedback/.test(sb.elements.app.innerHTML) && sameSet(sb.dataRequests(), filesOfIds(sb.context, ids)),
    'deep link #practice/daily restores after reload');
}
{
  // Reload during a mock exam section.
  const sb0 = sandbox();
  await flush();
  const m = sb0.context.App.mockBuild('mini');
  m.sections[0].started = true;
  m.index = 2;
  sb0.context.Store.state.mock = m;
  sb0.context.Store.save();
  const sb = sandbox(sb0.store, {hash: '#mock/run'});
  await flush();
  const out = sb.elements.app.innerHTML;
  check(/qNav/.test(out) && /第 3 題/.test(out) && sameSet(sb.dataRequests(), filesOfIds(sb.context, m.sections[0].ids)),
    'deep link #mock/run loads only the current section and restores');
  // Submitting every section loads the rest before grading.
  const A = sb.context.App;
  for (let i = 0; i < 3 && sb.context.Store.state.mock; i++) { A.actions['mock-submit'](); await flush(); }
  check(!sb.context.Store.state.mock && sb.context.Store.state.lastMock?.summary, 'mock grades after loading unseen sections');
  sb.context.location.hash = '#mock/review';
  await A.render();
  check(/逐題檢討/.test(sb.elements.app.innerHTML), 'mock review renders');
}

// Furigana off → no ruby files; turning it on loads the screen's ruby files and redraws.
{
  const off = sandbox();
  await flush();
  off.context.Store.state.settings.furigana = false;
  off.context.Store.save();
  const sb = sandbox(off.store);
  await flush();
  const {App: A} = sb.context;
  A.practice.startDrill('grammar', '文法形式', 10);
  sb.context.location.hash = '#practice/drill';
  await A.render();
  check(sb.requests.every(r => !r.startsWith('ruby/')) && !/<ruby>/.test(sb.elements.app.innerHTML), 'furigana off: no ruby files');
  A.actions['toggle-ruby']();
  await flush();
  const want = filesOfIds(sb.context, sb.context.Store.state.sessions.drill.ids).map(f => 'ruby/' + path.basename(f));
  check(sameSet(sb.requests.filter(r => r.startsWith('ruby/')), want) && /<ruby>/.test(sb.elements.app.innerHTML),
    'turning furigana on loads the ruby files and redraws');
}

// Notes page loads only that kind's note files.
{
  const sb = sandbox({}, {hash: '#notes/confuse'});
  await flush();
  const want = sb.context.Bank.catalog.files.filter(f => f.notes.some(n => n.kind === 'confuse')).map(f => f.file);
  check(sameSet(sb.dataRequests(), want) && /class="note"/.test(sb.elements.app.innerHTML), 'notes page loads only its note files');
}

// A failed file shows a retry message; retry loads it.
{
  const sb = sandbox({}, {quiet: true});
  await flush();
  const {App: A, Store} = sb.context;
  A.practice.startDrill('reading', '短文理解', 5);
  const files = filesOfIds(sb.context, Store.state.sessions.drill.ids);
  files.forEach(f => sb.fail.add(f));
  sb.context.location.hash = '#practice/drill';
  await A.render();
  check(/題目載入失敗/.test(sb.elements.app.innerHTML) && /data-action="retry-load"/.test(sb.elements.app.innerHTML), 'load failure shows a retry message');
  sb.fail.clear();
  A.actions['retry-load']();
  await flush();
  check(/questionPanel/.test(sb.elements.app.innerHTML), 'retry loads the file and draws the page');
}

// A load finishing after the user has moved on does not overwrite the new page.
{
  const hold = new Set();
  const sb = sandbox({}, {hold});
  await flush();
  const {App: A, Store} = sb.context;
  A.practice.startDrill('listening', '即時応答', 5);
  filesOfIds(sb.context, Store.state.sessions.drill.ids).forEach(f => hold.add(f));
  sb.context.location.hash = '#practice/drill';
  const pending = A.render();
  sb.context.location.hash = '#settings';
  await A.render();
  [...hold].forEach(sb.release);
  await pending;
  await flush();
  check(/id="examDate"/.test(sb.elements.app.innerHTML), 'late load does not replace the page the user moved to');
}

// The index agrees with the bank once everything is loaded.
const {context, store, elements, skipped} = sandbox();
await flush();
const {App: A, Store, topic, Bank} = context;
await Bank.ensure(allFiles(context), {ruby: true});
{
  const key = q => [q.id, q.cat, q.type, q.passageId || ''].join('|');
  const full = Bank.questions.map(key).sort();
  check(sameSet(A.questions.map(key), full) && A.questions.length === Bank.questions.length, `index matches the loaded bank (${Bank.questions.length} questions)`);
  check(sameSet(A.notes.map(n => n.id + n.kind), Bank.notes.map(n => n.id + n.kind)), `index matches the loaded notes (${Bank.notes.length})`);
  const tally = list => JSON.stringify(Object.entries(list.reduce((t, q) => ((t[q.cat + '/' + q.type] = (t[q.cat + '/' + q.type] || 0) + 1), t), {})).sort());
  check(tally(A.questions) === tally(Bank.questions), 'per-type counts from the index equal the full bank');
  const st = A.stats();
  check(Object.values(st.cats).reduce((n, c) => n + c.total, 0) === Bank.questions.length, 'stats totals equal the full bank');
  const groupsFull = new Map();
  for (const q of Bank.questions) groupsFull.set(q.passageId || q.id, (groupsFull.get(q.passageId || q.id) || 0) + 1);
  check([...A.groups].every(([k, g]) => groupsFull.get(k) === g.length) && A.groups.size === groupsFull.size, 'passage groups from the index equal the bank');
  check(Bank.catalog.files.every(f => f.ruby === 'ruby/' + path.basename(f.file)), 'index maps every bank file to its ruby file');
}
// Full question objects in index order, for the checks below.
const Q = A.questions.map(q => Bank.question(q.id));
console.log(`questions ${A.byId.size}, notes ${A.notes.length}, skipped scripts: ${skipped.length}, ` +
  `furigana entries ${Object.keys(context.Ruby.map).length}`);
check(A.byId.size >= 100 && Q.every(Boolean), 'bank loaded (legacy + data)');
check(/^\d{4}-\d{2}-\d{2}$/.test(topic.defaultExamDate), 'default exam date ' + topic.defaultExamDate);
check(new Date(topic.defaultExamDate + 'T00:00:00').getDay() === 0, 'default exam date is a Sunday');

// ---------- Leitner ----------
const t = Store.today();
const q0 = Q.find(q => !q.passage);
Store.state.settings.examDate = Store.addDays(t, 40);
Store.grade(q0.id, true);
let r = Store.state.records[q0.id];
check(r.box === 1 && r.due === Store.addDays(t, 1), 'correct → box 1, due tomorrow');
Store.grade(q0.id, true);
check(Store.state.records[q0.id].due === Store.addDays(t, 3), 'box 2 → +3 days');
Store.grade(q0.id, true);
Store.grade(q0.id, true);
check(Store.state.records[q0.id].due === Store.addDays(t, 14), 'box 4 → +14 days');
Store.state.settings.examDate = Store.addDays(t, 9);
const prev = Store.grade(q0.id, true);
check(Store.state.records[q0.id].due === Store.addDays(t, 4), 'interval capped at half the days to exam');
Store.markGuessed(q0.id, prev);
r = Store.state.records[q0.id];
check(r.box === 4 && r.due === Store.addDays(t, 1) && r.miss, '"guessed" keeps box, due tomorrow, marked miss');
Store.grade(q0.id, false);
r = Store.state.records[q0.id];
check(r.box === 0 && r.due === Store.addDays(t, 1), 'wrong → box 0, due tomorrow');
Store.state.settings.examDate = Store.addDays(t, 1);
Store.grade(q0.id, true);
check(Store.state.records[q0.id].due === Store.addDays(t, 1), 'interval at least one day');
check(Store.streak() === 1, 'streak counts today');

// ---------- sessions ----------
const groupsContiguous = list => {
  const seen = new Set();
  let last = null;
  for (const q of list) {
    const k = A.groupKey(q);
    if (k !== last && seen.has(k)) return false;
    seen.add(k);
    last = k;
  }
  return true;
};
const daily = A.practice.buildDaily();
check(daily.length >= Math.min(20, A.byId.size), `daily sprint has ${daily.length} items`);
check(new Set(daily.map(q => q.id)).size === daily.length, 'daily sprint has no duplicates');
check(groupsContiguous(daily), 'daily sprint keeps passage groups together');
const cats = new Set(daily.map(q => q.cat));
check(cats.size === Object.keys(A.byCat).length, 'daily sprint mixes all available subjects: ' + [...cats].join(','));
const due = A.questions.find(q => q.cat === 'vocab' && q.id !== q0.id);
Store.state.records[due.id] = {count: 1, correct: 0, box: 0, due: t, last: t, miss: true};
check(A.practice.buildDaily()[0].id === due.id || A.practice.buildDaily().slice(0, 4).some(q => q.id === due.id), 'due review comes first');

const drill = A.practice.buildDrill('reading', '', 10);
check(drill.length >= 10 && groupsContiguous(drill), `reading drill ${drill.length} items, groups intact`);

// ---------- mock ----------
for (const kind of ['mini', 'full']) {
  const m = A.mockBuild(kind);
  const ids = m.sections.flatMap(s => s.ids);
  check(new Set(ids).size === ids.length, `${kind} mock has no duplicates (${ids.length} items)`);
  const spec = topic.mocks[kind];
  const over = spec.sections.some((sec, i) => sec.items.some(([type, n]) =>
    m.sections[i].ids.filter(id => A.byId.get(id).type === type).length > Math.max(n, ...[...A.groups.values()].filter(g => g[0].type === type).map(g => g.length))));
  check(!over, `${kind} mock respects per-type counts`);
  check(m.sections.every(s => Object.keys(s.orders).length === s.ids.length), `${kind} mock stores option orders`);
}

// ---------- pages render ----------
context.location.hash = '';
const pages = ['#home', '#cat/vocab', '#cat/listening', '#mistakes', '#settings', '#mock', '#notes/grammar',
  '#notes/confuse', '#flash/grammar', '#practice/daily', '#mock/run', '#mock/review', '#nope'];
A.practice.startDaily(true);
for (const hash of pages) {
  context.location.hash = hash;
  if (hash === '#mock/run') Store.state.mock = A.mockBuild('mini');
  if (hash === '#mock/review') {
    // Answer the first item of each section, then submit all sections.
    const m = Store.state.mock;
    for (const sec of m.sections) sec.answers[sec.ids[0]] = 0;
    for (let i = 0; i < 3 && Store.state.mock; i++) A.actions['mock-submit']();
    check(!Store.state.mock && Store.state.lastMock?.summary && Store.state.mockHistory.length === 1, 'mock finishes and is recorded');
    context.location.hash = hash;
  }
  A.render();
  const out = elements.app.innerHTML;
  check(out.length > 100 && !/undefined|NaN|\[object Object\]/.test(out), 'renders ' + hash);
}
// Practice: answer the first item, then the result page.
context.location.hash = '#practice/daily';
const s = Store.state.sessions.daily;
A.actions.answer({dataset: {pos: '0'}});
check(Boolean(s.answers[0]), 'answering records the choice');
s.answers = s.ids.map(id => ({choice: 0, ok: Bank.question(id).answer === 0, guessed: false, prevBox: 0}));
s.done = true;
A.render();
check(/本回練習完成/.test(elements.app.innerHTML), 'session results render');

// ---------- furigana ----------
{
  const {Ruby, Bank} = context;
  const RAW = /\{[^{}|]+\|[^{}|]+\}/;
  const strip = html => html.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]+>/g, '');
  check(Bank.catalog.files.filter(f => f.ruby).length >= 26, 'manifest lists ruby/ files');
  for (const [type, t] of Object.entries(Bank.TYPES)) {
    if (!t.instruction) continue;
    const p = Ruby.get('#' + type).p;
    check(typeof p === 'string' && Ruby.strip(p) === t.instruction && p.includes('{'), 'instruction furigana matches ' + type);
  }
  check(Q.every(q => A.splitPrompt(q).stem === Bank.stem(q).stem), 'splitPrompt uses Bank.stem');

  // Annotate the first kanji run of a string with a dummy reading.
  const mark = text => text.replace(/[㐀-鿿々]+/, k => `{${k}|${'か'.repeat(k.length)}}`);
  const saved = {...Ruby.map};
  const render = (q, opts = {}) => A.questionHtml(q, {order: q.options.map((_, i) => i), reveal: true, ...opts});
  const plainQ = Q.find(q => q.type === '文法形式' && /[㐀-鿿]/.test(A.splitPrompt(q).stem) && q.options.some(o => /[㐀-鿿]/.test(o)));
  const stem = A.splitPrompt(plainQ).stem;
  const oi = plainQ.options.findIndex(o => /[㐀-鿿]/.test(o));
  Ruby.add(plainQ.id, {p: mark(stem), o: plainQ.options.map((o, i) => (i === oi ? mark(o) : o)), x: plainQ.explanation});
  Store.state.settings.furigana = true;
  let out = render(plainQ);
  check(/<ruby>[^<]+<rt>か+<\/rt><\/ruby>/.test(out), 'annotated stem renders <ruby>');
  check((out.match(/<ruby>/g) || []).length >= 2 + 1, 'stem, option and instruction get ruby');
  check(!RAW.test(out), 'no raw {…|…} marks in question html');
  check(strip(out).includes(stem.replace(/\n/g, '')) || strip(out).includes(stem), 'ruby html keeps the original text');
  Store.state.settings.furigana = false;
  out = render(plainQ);
  check(!/<ruby>/.test(out) && !RAW.test(out), 'furigana off → no <ruby>');
  Store.state.settings.furigana = true;
  Ruby.add(plainQ.id, {p: mark(stem) + 'X', o: ['{違|ちが}う', ...plainQ.options.slice(1)]});
  out = render(plainQ);
  check(!out.includes('<ruby>' + stem.match(/[㐀-鿿々]+/)[0]) && !RAW.test(out) && out.includes(A.esc(plainQ.options[0])), 'mismatched annotation falls back to plain text');
  Ruby.add(plainQ.id, {p: '<b>' + stem + '</b>'});
  check(!render(plainQ).includes('<b>'), 'mismatched annotation is not injected as html');

  // Passage blank highlight survives ruby; brackets around ruby still highlight.
  const textQ = Q.find(q => q.type === '文章文法' && q.passageId);
  if (textQ) {
    Ruby.add('@' + textQ.passageId, {t: textQ.passage.replace(/[㐀-鿿々]+/g, k => `{${k}|${'か'.repeat(k.length)}}`)});
    out = render(textQ);
    check(/<mark>（\s*\d+\s*）<\/mark>/.test(out) && /<ruby>/.test(out) && !RAW.test(out), 'passage ruby keeps the blank highlight');
  }
  const paraQ = Q.find(q => q.type === '近義改寫' && /【[^】]*[㐀-鿿][^】]*】/.test(A.splitPrompt(q).stem));
  if (paraQ) {
    const st = A.splitPrompt(paraQ).stem;
    Ruby.add(paraQ.id, {p: st.replace(/[㐀-鿿々]+/g, k => `{${k}|${'か'.repeat(k.length)}}`)});
    out = render(paraQ);
    check(/<span class="target">【[^】]*<ruby>/.test(out), 'target brackets wrap ruby');
  }

  // Listening: readings in the transcript, plain text to speech, options hidden before answering.
  const lq = Q.find(q => q.audio && q.audio.spokenOptions && q.audio.script.some(l => /[㐀-鿿]/.test(l[1])));
  if (lq) {
    Ruby.add(lq.id, {
      sc: mark(lq.audio.scene), qn: mark(lq.audio.question), s: lq.audio.script.map(l => mark(l[1])),
      o: lq.options.map(mark), x: lq.explanation
    });
    const order = lq.options.map((_, i) => i);
    const Speech = context.Speech;
    const real = {status: Speech.status, play: Speech.play};
    let spoken = null;
    Speech.status = () => 'ok';
    Speech.play = items => { spoken = items; };
    out = A.questionHtml(lq, {order, reveal: false});
    const choicesHtml = out.split('class="choices')[1] || '';
    check(/numbersOnly/.test(out) && !/<ruby>/.test(choicesHtml) && !lq.options.some(o => strip(choicesHtml).includes(o)) &&
      !/class="(question|transcript)"/.test(out), 'spoken options and transcript stay hidden before answering');
    A.playAudio();
    check(spoken && spoken.every(i => !/[{}<>|]/.test(i.text)) && spoken.some(i => i.text === lq.audio.script[0][1]), 'speech gets plain text');
    out = A.questionHtml(lq, {order, reveal: true});
    check(/class="transcript"[\s\S]*<ruby>/.test(out) && !RAW.test(out), 'transcript renders ruby after answering');
    Object.assign(Speech, real);
  }

  // Every page with dummy marks on every question and note: no raw marks leak.
  const dummy = text => (typeof text === 'string' ? text.replace(/[㐀-鿿々]+/g, k => `{${k}|${'か'.repeat(k.length)}}`) : text);
  for (const q of Q) {
    const e = {x: dummy(q.explanation), o: q.options.map(dummy)};
    if (q.audio) Object.assign(e, {sc: dummy(q.audio.scene), qn: dummy(q.audio.question), s: q.audio.script.map(l => dummy(l[1]))});
    else e.p = dummy(A.splitPrompt(q).stem);
    if (q.passage && !q.passageId) e.t = dummy(q.passage);
    Ruby.add(q.id, e);
    if (q.passageId) Ruby.add('@' + q.passageId, {t: dummy(q.passage)});
  }
  for (const n of Bank.notes) Ruby.add(n.id, {t: dummy(n.title), e: dummy(n.example), ie: (n.items || []).map(i => dummy(i.example))});
  for (const q of A.questions.slice(0, 60)) Store.grade(q.id, false);
  A.practice.startDaily(true);
  Store.state.mock = A.mockBuild('mini');
  Store.state.mock.sections[0].started = true;
  const leaks = [];
  let rubies = 0;
  for (const on of [true, false]) {
    Store.state.settings.furigana = on;
    for (const hash of ['#practice/daily', '#mistakes', '#notes/grammar', '#notes/confuse', '#flash/grammar', '#mock/run', '#mock/review', '#settings']) {
      context.location.hash = hash;
      A.render();
      const html = elements.app.innerHTML;
      if (RAW.test(html)) leaks.push(hash);
      if (!on && /<ruby>/.test(html)) leaks.push(hash + ' (off)');
      if (on) rubies += (html.match(/<ruby>/g) || []).length;
    }
  }
  check(!leaks.length, 'no raw marks / ruby when off on any page' + (leaks.length ? ': ' + leaks.join(', ') : ''));
  check(rubies > 50, `pages render ruby when on (${rubies})`);
  check(/data-action="toggle-ruby" aria-pressed="true"/.test((Store.state.settings.furigana = true, context.location.hash = '#practice/daily', A.render(), elements.app.innerHTML)), 'quick toggle on practice page');
  A.actions['toggle-ruby']();
  check(Store.state.settings.furigana === false && /aria-pressed="false"/.test(elements.app.innerHTML), 'quick toggle switches the setting');
  check(Store.normalize({settings: {furigana: false}}).settings.furigana === false && Store.normalize({}).settings.furigana === true, 'furigana setting survives export/import, defaults on');
  for (const k of Object.keys(Ruby.map)) delete Ruby.map[k];
  Object.assign(Ruby.map, saved);
  Store.state.settings.furigana = true;
  Store.state.mock = null;
}

// ---------- migration ----------
const v1 = {records: {[q0.id]: {count: 3, correct: 1, wrong: true}, 'kanji-02': {count: 2, correct: 2, wrong: false}},
  sessions: {}, days: {'2026-11-20': 12}};
const m2 = sandbox({'study-sprint.v1.jlpt-n3': JSON.stringify(v1)});
const st2 = m2.context.Store.state;
check(m2.context.Store.migrated && st2.records[q0.id].box === 0 && st2.records[q0.id].miss, 'v1 wrong answer migrates to box 0');
check(st2.records['kanji-02'].box === 1 && st2.days['2026-11-20'] === 12, 'v1 correct answer and days migrate');
check(Boolean(m2.store['study-sprint.v2.jlpt-n3']), 'migrated state saved under v2 key');

// ---------- storage unavailable ----------
const broken = sandbox();
broken.context.localStorage.setItem = () => { throw new Error('denied'); };
// Re-run store with failing storage.
vm.runInContext(fs.readFileSync(path.join(dist, 'store.js'), 'utf8'), broken.context);
check(broken.context.Store.storageOk === false, 'detects unavailable storage');

console.log(failures ? `${failures} failure(s)` : 'smoke OK');
process.exit(failures ? 1 : 0);
