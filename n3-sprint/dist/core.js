// Shared helpers: question indexes, statistics, selection, and the question
// renderer (passage layout + listening player) used by practice and mock exams.
globalThis.App = (() => {
  const pack = globalThis.topic;
  const Store = globalThis.Store;
  const Speech = globalThis.Speech;

  // ---------- escaping & small html helpers ----------
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => (
    {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]
  ));
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

  // `en` (English label) is kept in the signature for callers but no longer shown.
  function pageHead(zh, en, desc = '') {
    return `<div class="pageHead"><h1 tabindex="-1">${esc(zh)}</h1>${desc ? `<p>${desc}</p>` : ''}</div>`;
  }
  function sectionTitle(zh, en, tail = '') {
    return `<div class="sectionTitle"><h2>${esc(zh)}</h2>${tail ? `<span class="tail">${tail}</span>` : ''}</div>`;
  }
  function track(value, label) {
    const v = Math.max(0, Math.min(100, value));
    return `<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}"` +
      `${label ? ` aria-label="${esc(label)}"` : ''}><i style="width:${v}%"></i></div>`;
  }
  const fmtDate = d => {
    const [, m, day] = String(d).split('-');
    return `${Number(m)}/${Number(day)}`;
  };

  // ---------- indexes (built once, from manifest.js) ----------
  // Index entries are {id, cat, type, passageId?, file}: enough to count and select.
  // Question text (prompt, options, passage, audio, explanation, answer) lives in the
  // data files, which are loaded on demand: call A.load(ids) and wait before A.question(id).
  const Bank = globalThis.Bank;
  const questions = Bank.catalog.questions;
  const notes = Bank.catalog.notes;
  const question = id => Bank.question(id);
  const note = id => Bank.note(id);
  const optionCount = q => (Bank.TYPES[q.type] || {}).options || 4;
  const rubyWanted = () => Store.state.settings.furigana !== false;
  const load = items => Bank.ensure(items, {ruby: rubyWanted()});
  const loaded = items => Bank.ready(items, {ruby: rubyWanted()});
  const byId = new Map();
  const byCat = {};
  const byType = {};
  const groups = new Map();      // group key -> questions in bank order
  const groupKey = q => q.passageId || q.id;
  for (const q of questions) {
    if (byId.has(q.id)) continue;
    byId.set(q.id, q);
    (byCat[q.cat] ||= []).push(q);
    (byType[q.type] ||= []).push(q);
    const key = groupKey(q);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  const category = id => pack.categories.find(c => c.id === id);
  const typeInfo = name => pack.types.find(t => t.name === name) || {name, ja: name, cat: byType[name]?.[0]?.cat};
  // Types of a category in display order, including unexpected ones found in data.
  function typesOf(cat) {
    const known = pack.types.filter(t => t.cat === cat);
    const extra = Object.keys(byType).filter(t => byType[t][0].cat === cat && !known.some(k => k.name === t));
    return [...known, ...extra.map(typeInfo)];
  }

  // ---------- statistics (one O(n) pass) ----------
  function stats() {
    const rec = Store.state.records;
    const blank = () => ({total: 0, seen: 0, count: 0, correct: 0, mastered: 0, due: 0});
    const cats = {};
    const types = {};
    let due = 0;
    for (const q of byId.values()) {
      const c = cats[q.cat] ||= blank();
      const t = types[q.type] ||= blank();
      const r = rec[q.id];
      for (const s of [c, t]) {
        s.total++;
        if (r && r.count) {
          s.seen++;
          s.count += r.count;
          s.correct += r.correct;
          if (r.box >= 2) s.mastered++;
          if (Store.isDue(r)) s.due++;
        }
      }
      if (Store.isDue(r)) due++;
    }
    const MIN_SAMPLE = 6;
    const weak = Object.entries(types)
      .filter(([, s]) => s.count >= MIN_SAMPLE)
      .map(([type, s]) => ({type, acc: s.correct / s.count, count: s.count}))
      .sort((a, b) => a.acc - b.acc);
    return {cats, types, due, weak, minSample: MIN_SAMPLE};
  }

  // ---------- selection ----------
  function shuffle(items) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const permutation = n => shuffle([...Array(n).keys()]);

  // Splits a pool into priority tiers: due reviews, unseen, then other seen items.
  function tiers(pool) {
    const rec = Store.state.records;
    const due = [];
    const fresh = [];
    const seen = [];
    for (const q of pool) {
      const r = rec[q.id];
      if (!r || !r.count) fresh.push(q);
      else if (Store.isDue(r)) due.push(q);
      else seen.push(q);
    }
    due.sort((a, b) => rec[a.id].due.localeCompare(rec[b.id].due) || rec[a.id].box - rec[b.id].box);
    seen.sort((a, b) => rec[a.id].box - rec[b.id].box || String(rec[a.id].last).localeCompare(String(rec[b.id].last)));
    return {due, fresh: shuffle(fresh), seen};
  }

  // Walks ranked questions and takes whole passage groups until `limit` items.
  // `taken` (Set of group keys) is shared so groups are never taken twice.
  function takeUnits(ranked, limit, taken = new Set()) {
    const units = [];
    let size = 0;
    for (const q of ranked) {
      if (size >= limit) break;
      const key = groupKey(q);
      if (taken.has(key)) continue;
      taken.add(key);
      const unit = groups.get(key) || [q];
      units.push(unit);
      size += unit.length;
    }
    return {units, size};
  }

  // Ranked practice pool: due → unseen → least-mastered.
  function ranked(pool) {
    const t = tiers(pool);
    return [...t.due, ...t.fresh, ...t.seen];
  }

  // ---------- furigana ----------
  // All Japanese question text goes through ja(): it returns escaped HTML, with
  // <ruby> readings when the setting is on and a matching annotation exists.
  // Speech always uses the original plain strings, never these.
  const Ruby = globalThis.Ruby;
  const rubyOn = rubyWanted;
  const ja = (plain, annotated) => (Ruby ? Ruby.html(plain, annotated, {on: rubyOn()}) : esc(plain));
  const marks = key => (Ruby ? Ruby.get(key) : {}) || {};
  const rb = {
    instruction: (q, text) => ja(text, marks('#' + q.type).p),
    stem: (q, text) => ja(text, q.audio ? marks(q.id).qn : marks(q.id).p),
    option: (q, orig) => ja(q.options[orig], marks(q.id).o?.[orig]),
    explanation: q => ja(q.explanation, marks(q.id).x),
    passage: q => ja(q.passage, q.passageId ? marks('@' + q.passageId).t : marks(q.id).t),
    scene: q => ja(q.audio.scene, marks(q.id).sc),
    question: q => ja(q.audio.question, marks(q.id).qn),
    line: (q, i) => ja(q.audio.script[i][1], marks(q.id).s?.[i]),
    // First line shown in lists for a listening item (question, else scene, else first line).
    lead: q => (q.audio.question ? rb.question(q) : q.audio.scene ? rb.scene(q) : q.audio.script.length ? rb.line(q, 0) : '')
  };
  function rubyToggleHtml() {
    const on = rubyOn();
    return `<button type="button" class="rubyToggle" data-action="toggle-ruby" aria-pressed="${on}" title="漢字上方顯示假名注音">` +
      `<span class="rubyGlyph" lang="ja" aria-hidden="true">あ</span>注音<b>${on ? '開' : '關'}</b></button>`;
  }

  // ---------- prompt / passage rendering ----------
  // Works on escaped HTML that may contain <ruby> marks; a bracket pair is only
  // wrapped when it does not cut through a ruby element.
  const balanced = s => (s.match(/<ruby>/g) || []).length === (s.match(/<\/ruby>/g) || []).length;
  const highlightTargets = html => html
    .replace(/【([^【】\n]*?)】/g, (m, inner) => (balanced(inner) ? `<span class="target">【${inner}】</span>` : m))
    .replace(/★/g, '<span class="star">★</span>');

  // Same split as the furigana files use, so `p` annotations line up with the stem.
  const splitPrompt = q => globalThis.Bank.stem(q);

  function passageHtml(q, ui) {
    let body = rb.passage(q);
    const blank = String(q.prompt).match(/（\s*(\d+)\s*）/);
    if (blank) {
      // Blank markers contain no kanji, so they are never inside a <ruby> element.
      const re = new RegExp(`（\\s*${blank[1]}\\s*）`, 'g');
      body = body.replace(re, m => `<mark>${m}</mark>`);
    }
    const collapsed = ui.passageCollapsed;
    return `<section class="passageCol${collapsed ? ' collapsed' : ''}" aria-label="本文">` +
      `<button type="button" class="passageToggle" data-action="toggle-passage" aria-expanded="${!collapsed}" aria-controls="passageText">` +
      `<span>本文</span><small>${collapsed ? '展開' : '收合'}</small></button>` +
      `<div id="passageText" class="passage" lang="ja" tabindex="0">${body}</div></section>`;
  }

  // ---------- listening ----------
  const SPEAKER = {M: '男', F: '女', M2: '男２', F2: '女２', N: '旁白'};

  function speechItems(q, order) {
    const a = q.audio;
    const items = [];
    if (a.scene) items.push({speaker: 'N', text: a.scene, label: '情境說明'});
    if (a.question && pack.questionFirst.includes(q.type)) items.push({speaker: 'N', text: a.question, label: '提問'});
    for (const [speaker, line] of a.script) items.push({speaker, text: line, label: '本文'});
    if (a.question) items.push({speaker: 'N', text: a.question, label: '提問'});
    if (a.spokenOptions) {
      order.forEach((orig, i) => items.push({speaker: 'N', text: `${i + 1}番。${q.options[orig]}`, label: `選項 ${i + 1}`}));
    }
    return items;
  }

  function scriptHtml(q, order, {withOptions = false} = {}) {
    const a = q.audio;
    const rows = [];  // [speaker, html]
    if (a.scene) rows.push(['N', rb.scene(q)]);
    a.script.forEach(([sp], i) => rows.push([sp, rb.line(q, i)]));
    if (a.question) rows.push(['N', rb.question(q)]);
    if (withOptions && a.spokenOptions) order.forEach((orig, i) => rows.push(['N', `${i + 1}番　${rb.option(q, orig)}`]));
    return `<dl class="script" lang="ja">` + rows.map(([sp, line]) =>
      `<div class="line sp-${esc(sp)}"><dt>${esc(SPEAKER[sp] || sp)}</dt><dd>${line}</dd></div>`).join('') + '</dl>';
  }

  const ui = {passageCollapsed: false, textMode: false, audio: null};

  function audioMode() {
    if (ui.textMode) return 'text';
    const s = Speech.status();
    if (s === 'unsupported' || s === 'novoice') return 'text';
    return s === 'loading' ? 'loading' : 'speech';
  }

  function playerHtml(q, order, reveal) {
    const mode = audioMode();
    const rate = Store.state.settings.rate;
    if (mode === 'text') {
      const why = ui.textMode ? '目前為文字模式。' :
        Speech.status() === 'unsupported' ? '此瀏覽器不支援語音合成。' : '找不到日語語音（可在系統設定安裝日語語音）。';
      return `<div class="player textMode"><p class="playerNote">${why}請閱讀下方文字稿作答。` +
        (ui.textMode && Speech.status() === 'ok' ? ` <button type="button" class="textBtn" data-action="audio-text">改回語音</button>` : '') +
        `</p>${reveal ? '' : scriptHtml(q, order, {withOptions: true})}</div>`;
    }
    const disabled = mode === 'loading' ? ' disabled' : '';
    return `<div class="player" id="player">` +
      `<div class="playerRow">` +
      `<button type="button" class="primary" data-action="audio-play"${disabled}><span aria-hidden="true">▶</span>播放</button>` +
      `<button type="button" class="secondary" data-action="audio-stop"${disabled}><span aria-hidden="true">■</span>停止</button>` +
      `<button type="button" class="secondary" data-action="audio-play" data-replay${disabled}><span aria-hidden="true">↺</span>重播</button>` +
      `<span class="rate" role="group" aria-label="語速">` +
      [0.8, 1].map(r => `<button type="button" data-action="audio-rate" data-rate="${r}" aria-pressed="${rate === r}">${r.toFixed(1)}×</button>`).join('') +
      `</span></div>` +
      `<p class="playerStatus" id="playerStatus" aria-live="polite">${mode === 'loading' ? '正在載入日語語音…' : '按「播放」開始聆聽（快捷鍵 P）。'}</p>` +
      `<p class="playerAlt"><button type="button" class="textBtn" data-action="audio-text">聽不到？改看文字稿作答</button></p></div>`;
  }

  function setPlayerStatus(text, playing) {
    const el = document.getElementById('playerStatus');
    if (el) el.textContent = text;
    document.getElementById('player')?.classList.toggle('playing', Boolean(playing));
  }

  function playAudio() {
    const ctx = ui.audio;
    if (!ctx || audioMode() !== 'speech') return;
    const items = speechItems(ctx.q, ctx.order);
    setPlayerStatus('準備播放…', true);
    Speech.play(items, {
      rate: Store.state.settings.rate,
      onItem: i => setPlayerStatus(`播放中：${items[i].label}（${i + 1} / ${items.length}）`, true),
      onDone: () => setPlayerStatus('播放完畢。可以重播或直接作答。', false)
    });
  }
  function stopAudio() {
    Speech.stop();
    setPlayerStatus('已停止。', false);
  }

  // ---------- question renderer ----------
  // opts: order (display→original index), chosen (original index), reveal, after (html)
  function questionHtml(q, {order, chosen, reveal = false, after = ''}) {
    const {instruction, stem} = splitPrompt(q);
    const listening = Boolean(q.audio);
    const textMode = listening && audioMode() === 'text';
    if (listening) ui.audio = {q, order};
    const hideOptions = listening && q.audio.spokenOptions && !reveal && !textMode;
    const showStem = !listening || reveal || textMode;

    let head = `<div class="qMeta"><span class="tag">${esc(q.type)}</span><span class="tagJa" lang="ja">${esc(typeInfo(q.type).ja)}</span></div>`;
    if (listening) {
      head += playerHtml(q, order, reveal);
      if (q.audio.showScene && q.audio.scene && !reveal && !textMode) {
        head += `<p class="scene" lang="ja">${rb.scene(q)}</p>`;
      }
    }
    if (instruction) head += `<p class="instruction" lang="ja">${rb.instruction(q, instruction)}</p>`;
    if (showStem && stem.trim()) head += `<h2 class="question" lang="ja">${highlightTargets(rb.stem(q, stem))}</h2>`;
    if (listening && !showStem) head += `<p class="hint">聽完後選出答案${hideOptions ? '（選項會朗讀，作答後才顯示文字）' : ''}。</p>`;

    const choices = `<div class="choices${hideOptions ? ' numbersOnly' : ''}" role="group" aria-label="選項">` + order.map((orig, i) => {
      let cls = 'answer';
      let mark = '';
      if (reveal) {
        if (orig === q.answer) { cls += ' correct'; mark = '正解'; }
        else if (orig === chosen) { cls += ' wrong'; mark = '你的答案'; }
      } else if (orig === chosen) cls += ' selected';
      const label = hideOptions ? `${i + 1}番` : rb.option(q, orig);
      return `<button type="button" class="${cls}" data-action="answer" data-pos="${i}"` +
        `${reveal ? ' disabled' : ''}${!reveal ? ` aria-pressed="${orig === chosen}"` : ''}>` +
        `<span class="key">${i + 1}</span><bdi lang="ja">${label}</bdi>${mark ? `<em class="mark">${mark}</em>` : ''}</button>`;
    }).join('') + '</div>';

    const transcript = listening && reveal
      ? `<details class="transcript" open><summary>完整文字稿</summary>${scriptHtml(q, order, {withOptions: true})}</details>`
      : '';

    // Feedback (`after`) comes before the transcript so the verdict stays next to the choices.
    const main = `<div class="qMain">${head}${choices}${after}${transcript}</div>`;
    return q.passage
      ? `<div class="qLayout split">${passageHtml(q, ui)}${main}</div>`
      : `<div class="qLayout">${main}</div>`;
  }

  // Stem line used in review lists: listening items show their question (or first line).
  const promptHtml = (q, stem = splitPrompt(q).stem) => (q.audio ? rb.lead(q) : highlightTargets(rb.stem(q, stem)));

  // Answer review block used in session results and mock review.
  function reviewHtml(q, {order, chosen, guessed, index}) {
    const ok = chosen === q.answer;
    const status = chosen === undefined || chosen === null ? '未作答' : ok ? (guessed ? '猜對' : '答對') : '答錯';
    const {instruction, stem} = splitPrompt(q);
    const yours = chosen === undefined || chosen === null ? '—' : rb.option(q, chosen);
    return `<article class="entry review ${ok && !guessed ? 'ok' : 'miss'}">` +
      `<div class="reviewHead">${index !== undefined ? `<span class="num">${index + 1}</span>` : ''}` +
      `<span class="tag">${esc(q.type)}</span><span class="verdict">${status}</span></div>` +
      (instruction ? `<p class="instruction" lang="ja">${rb.instruction(q, instruction)}</p>` : '') +
      `<p class="reviewPrompt" lang="ja">${promptHtml(q, stem)}</p>` +
      `<p class="reviewAns"><span>你的答案</span><bdi lang="ja">${yours}</bdi></p>` +
      `<p class="reviewAns right"><span>正解</span><bdi lang="ja">${rb.option(q, q.answer)}</bdi></p>` +
      `<p class="explain">${rb.explanation(q)}</p>` +
      (q.passage ? `<details><summary>查看本文</summary><div class="passage" lang="ja">${rb.passage(q)}</div></details>` : '') +
      (q.audio ? `<details><summary>查看文字稿</summary>${scriptHtml(q, order || q.options.map((_, i) => i), {withOptions: true})}</details>` : '') +
      '</article>';
  }

  // Per-type score table from [{q, ok}] items.
  function typeScoreTable(items) {
    const rows = new Map();
    for (const {q, ok} of items) {
      const r = rows.get(q.type) || {total: 0, ok: 0};
      r.total++;
      r.ok += ok ? 1 : 0;
      rows.set(q.type, r);
    }
    const order = pack.types.map(t => t.name);
    const sorted = [...rows.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    return `<table class="scoreTable"><thead><tr><th scope="col">題型</th><th scope="col">答對</th><th scope="col">正確率</th></tr></thead><tbody>` +
      sorted.map(([type, r]) => `<tr><th scope="row">${esc(type)}</th><td>${r.ok} / ${r.total}</td>` +
        `<td><span class="miniBar"><i style="width:${pct(r.ok, r.total)}%"></i></span>${pct(r.ok, r.total)}%</td></tr>`).join('') +
      '</tbody></table>';
  }

  return {
    pack, Store, Speech, esc, pct, pageHead, sectionTitle, track, fmtDate,
    questions, notes, byId, byCat, byType, groups, groupKey, category, typeInfo, typesOf,
    question, note, optionCount, load, loaded,
    stats, shuffle, permutation, tiers, takeUnits, ranked,
    questionHtml, reviewHtml, typeScoreTable, scriptHtml, splitPrompt, promptHtml,
    ja, rb, rubyOn, rubyToggleHtml,
    ui, audioMode, playAudio, stopAudio,
    // needs[page](args) lists the question/note ids a page shows; the router loads them first.
    routes: {}, needs: {}, actions: {}, keys: {}, render: () => Promise.resolve()
  };
})();
