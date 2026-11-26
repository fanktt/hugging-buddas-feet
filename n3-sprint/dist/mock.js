// Mock exams: mini (≈25 min) and full (three timed sections, N3 structure).
// The clock runs only while the exam page is open; time is kept as
// accumulated `elapsed` plus a `resumedAt` timestamp, so it survives reloads.
(() => {
  const A = globalThis.App;
  const {pack, Store, esc, pct} = A;
  const PASS = pack.passScore;

  // ---------- building ----------
  // Takes up to n questions of a type; passage groups are kept whole and only
  // added if they fit (at least one group is taken if any exist).
  function pickType(type, n, taken) {
    const rec = Store.state.records;
    const pool = A.shuffle(A.byType[type] || [])
      .sort((a, b) => (rec[a.id]?.count || 0) - (rec[b.id]?.count || 0));
    const picked = [];
    let firstUnit = null;
    for (const q of pool) {
      if (picked.length >= n) break;
      const key = A.groupKey(q);
      if (taken.has(key)) continue;
      const unit = A.groups.get(key) || [q];
      firstUnit ||= {key, unit};
      if (picked.length + unit.length > n) continue;
      taken.add(key);
      picked.push(...unit);
    }
    if (!picked.length && firstUnit) {
      taken.add(firstUnit.key);
      picked.push(...firstUnit.unit);
    }
    return picked;
  }

  function buildMock(kind) {
    const spec = pack.mocks[kind];
    const taken = new Set();
    const sections = spec.sections.map(sec => {
      const list = sec.items.flatMap(([type, n]) => pickType(type, n, taken));
      const orders = {};
      for (const q of list) orders[q.id] = A.permutation(q.options.length);
      return {
        id: sec.id, name: sec.name, minutes: sec.minutes,
        ids: list.map(q => q.id), orders, answers: {}, flags: {},
        started: false, submitted: false, elapsed: 0, resumedAt: null
      };
    });
    // Empty sections (types not written yet) are skipped.
    sections.forEach(s => { if (!s.ids.length) s.submitted = true; });
    const current = Math.max(0, sections.findIndex(s => s.ids.length));
    return {kind, created: Date.now(), sections, current, index: 0};
  }

  const available = (type, n) => Math.min(n, (A.byType[type] || []).length);

  // ---------- clock ----------
  const mock = () => Store.state.mock;
  const section = () => mock()?.sections[mock().current];
  const limitMs = sec => sec.minutes * 60000;
  const usedMs = sec => sec.elapsed + (sec.resumedAt ? Date.now() - sec.resumedAt : 0);
  const remainingMs = sec => Math.max(0, limitMs(sec) - usedMs(sec));

  function fold(sec) {
    if (!sec?.resumedAt) return;
    sec.elapsed += Math.max(0, Date.now() - sec.resumedAt);
    sec.resumedAt = Date.now();
  }
  function pauseClock() {
    const sec = section();
    if (!sec?.resumedAt) return;
    fold(sec);
    sec.resumedAt = null;
    Store.save();
  }
  function resumeClock() {
    const sec = section();
    if (!sec || !sec.started || sec.submitted || sec.resumedAt) return;
    sec.resumedAt = Date.now();
    Store.save();
  }

  let ticker = null;
  let tickCount = 0;
  function stopTick() {
    clearInterval(ticker);
    ticker = null;
  }
  function startTick() {
    stopTick();
    ticker = setInterval(() => {
      const sec = section();
      if (!sec || !sec.resumedAt) return stopTick();
      const left = remainingMs(sec);
      updateTimer(left);
      if (left <= 0) {
        submitSection(true);
        return;
      }
      if (++tickCount % 10 === 0) { fold(sec); Store.save(); }
    }, 1000);
  }
  const clock = ms => {
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  function updateTimer(left) {
    const el = document.getElementById('timer');
    if (!el) return;
    el.textContent = clock(left);
    el.classList.toggle('low', left < 5 * 60000);
  }

  // ---------- flow ----------
  function start(kind) {
    if (mock() && !confirm('目前有一回未完成的模考，要放棄它並開始新的嗎？')) return;
    const m = buildMock(kind);
    if (!m.sections.some(s => s.ids.length)) return alert('題庫準備中，暫時無法組成模考。');
    Store.state.mock = m;
    Store.save();
    location.hash = '#mock/run';
  }

  function beginSection() {
    const sec = section();
    if (!sec) return;
    sec.started = true;
    sec.resumedAt = Date.now();
    mock().index = 0;
    Store.save();
    A.render();
  }

  function submitSection(auto = false) {
    const m = mock();
    const sec = section();
    if (!sec) return;
    if (!auto) {
      const blank = sec.ids.filter(id => sec.answers[id] === undefined).length;
      const msg = blank ? `本節還有 ${blank} 題未作答，確定交卷？` : '確定交出本節？交卷後不能再修改。';
      if (!confirm(msg)) return;
    }
    stopTick();
    fold(sec);
    sec.resumedAt = null;
    sec.submitted = true;
    sec.autoSubmitted = auto;
    m.current++;
    m.index = 0;
    // Skip sections that ended up empty (bank still being written).
    while (m.current < m.sections.length && !m.sections[m.current].ids.length) {
      m.sections[m.current].submitted = true;
      m.current++;
    }
    if (m.current >= m.sections.length) return finish();
    Store.save();
    A.render();
    if (auto) A.announce('時間到，本節已自動交卷。');
  }

  function scoreOf(sec) {
    const correct = sec.ids.filter(id => sec.answers[id] === A.byId.get(id)?.answer).length;
    const total = sec.ids.length;
    return {id: sec.id, name: sec.name, correct, total, score: total ? Math.round(correct / total * PASS.sectionMax) : null};
  }

  function finish() {
    const m = mock();
    for (const sec of m.sections) {
      for (const id of sec.ids) {
        const q = A.byId.get(id);
        if (q) Store.grade(id, sec.answers[id] === q.answer);
      }
    }
    const scores = m.sections.map(scoreOf);
    const scored = scores.filter(s => s.score !== null);
    const total = scored.reduce((n, s) => n + s.score, 0);
    const pass = scored.length === scores.length && total >= PASS.total && scored.every(s => s.score >= PASS.section);
    const summary = {date: Store.today(), kind: m.kind, sections: scores, total, pass};
    m.summary = summary;
    m.finished = Date.now();
    Store.state.mockHistory.push(summary);
    Store.state.lastMock = m;
    Store.state.mock = null;
    Store.save();
    location.hash = '#mock/review';
  }

  // ---------- views ----------
  function landing() {
    const m = mock();
    let html = A.pageHead('模擬考', 'Mock exam', '考試中不顯示對錯與解析，可跳題、標記，交卷後統一檢討。成績會寫入每題的複習紀錄。');
    if (m) {
      const answered = m.sections.reduce((n, s) => n + Object.keys(s.answers).length, 0);
      const total = m.sections.reduce((n, s) => n + s.ids.length, 0);
      html += `<section class="panel resume"><div><span class="tag">進行中</span><h2>${esc(pack.mocks[m.kind].name)}</h2>` +
        `<p class="sub">第 ${m.current + 1} 節・已作答 ${answered} / ${total} 題・計時在離開頁面時暫停</p></div>` +
        `<div class="actions"><a class="primary" href="#mock/run">繼續作答</a>` +
        `<button type="button" class="textBtn" data-action="mock-abandon">放棄這回</button></div></section>`;
    }
    html += '<div class="mockCards">' + ['mini', 'full'].map(kind => {
      const spec = pack.mocks[kind];
      const sections = spec.sections.map(sec => {
        const want = sec.items.reduce((n, [, k]) => n + k, 0);
        const have = sec.items.reduce((n, [t, k]) => n + available(t, k), 0);
        return `<li><span>${esc(sec.name)}</span><span>${sec.minutes} 分・${have < want ? `${have}／` : ''}${want} 題</span></li>`;
      }).join('');
      return `<article class="mockCard ${kind}"><span class="english">${esc(spec.english)}</span><h2>${esc(spec.name)}</h2>` +
        `<p>${esc(spec.desc)}</p><ul class="sectionList">${sections}</ul>` +
        `<button type="button" class="${kind === 'mini' ? 'primary' : 'secondary'}" data-action="mock-start" data-kind="${kind}">開始${esc(spec.name)}（${spec.minutes} 分）</button></article>`;
    }).join('') + '</div>';
    html += A.sectionTitle('模考紀錄', 'History');
    const hist = [...Store.state.mockHistory].reverse();
    html += hist.length
      ? `<section class="panel"><table class="scoreTable history"><thead><tr><th scope="col">日期</th><th scope="col">類型</th>` +
        `<th scope="col">文字語彙</th><th scope="col">文法讀解</th><th scope="col">聽解</th><th scope="col">粗估總分</th><th scope="col">參考</th></tr></thead><tbody>` +
        hist.slice(0, 20).map(h => `<tr><td>${esc(A.fmtDate(h.date))}</td><td>${esc(pack.mocks[h.kind]?.name || h.kind)}</td>` +
          (h.sections || []).map(s => `<td>${s.score ?? '—'}</td>`).join('') +
          `<td><b>${esc(h.total)}</b> / 180</td><td>${h.pass ? '<span class="stamp ok">合</span>' : '<span class="stamp">未</span>'}</td></tr>`).join('') +
        '</tbody></table>' +
        (Store.state.lastMock ? '<p><a href="#mock/review">查看上一回的逐題檢討</a></p>' : '') + '</section>'
      : '<div class="panel empty"><p class="sub">還沒有模考紀錄。建議先做一回迷你模考抓感覺。</p></div>';
    return html;
  }

  function intro(m, sec) {
    const spec = pack.mocks[m.kind];
    const n = m.current + 1;
    return '<div class="practice">' +
      A.pageHead(`第 ${n} 節　${sec.name}`, `${spec.english} · Section ${n} / ${m.sections.length}`, '') +
      `<section class="panel sectionIntro"><div class="bigClock"><strong>${sec.minutes}</strong><span>分鐘</span></div>` +
      `<ul class="rules"><li>本節共 <b>${sec.ids.length}</b> 題，可跳題、標記，用上方題號導覽切換。</li>` +
      '<li>作答中不顯示對錯與解析，全部交卷後統一檢討。</li>' +
      '<li>時間到會自動交出本節。離開此頁時計時暫停，可回來續考。</li>' +
      (sec.id === 'listening' ? '<li>聽解題請先確認喇叭音量；每題可自行播放。</li>' : '') +
      `</ul><div class="actions"><button type="button" class="primary" data-action="mock-begin" id="beginBtn">開始本節</button>` +
      '<a class="secondary" href="#mock">先離開</a></div></section></div>';
  }

  function navHtml(sec, index) {
    return `<nav class="qNav" aria-label="題號導覽">` + sec.ids.map((id, i) => {
      const cls = [sec.answers[id] !== undefined ? 'done' : '', sec.flags[id] ? 'flag' : ''].filter(Boolean).join(' ');
      const state = `${sec.answers[id] !== undefined ? '已作答' : '未作答'}${sec.flags[id] ? '，已標記' : ''}`;
      return `<button type="button" class="${cls}" data-action="mock-jump" data-index="${i}" aria-label="第 ${i + 1} 題，${state}"` +
        `${i === index ? ' aria-current="step"' : ''}>${i + 1}</button>`;
    }).join('') + '</nav>';
  }

  function examView(m, sec) {
    const index = Math.min(m.index, sec.ids.length - 1);
    const id = sec.ids[index];
    const q = A.byId.get(id);
    if (!q) return '<p class="warn">題目資料遺失，請放棄這回模考。</p>';
    const flagged = Boolean(sec.flags[id]);
    const controls = '<div class="examControls">' +
      `<button type="button" class="secondary" data-action="mock-move" data-step="-1"${index === 0 ? ' disabled' : ''}>← 上一題</button>` +
      `<button type="button" class="secondary flagBtn" data-action="mock-flag" aria-pressed="${flagged}">${flagged ? '★ 已標記' : '☆ 標記'}</button>` +
      (index + 1 < sec.ids.length
        ? '<button type="button" class="primary" data-action="mock-move" data-step="1">下一題 →</button>'
        : '<button type="button" class="primary" data-action="mock-submit">交出本節</button>') +
      '</div>';
    const answered = Object.keys(sec.answers).length;
    return `<div class="exam practice${q.passage ? ' wide' : ''}">` +
      `<div class="examBar"><div><span class="english">Section ${m.current + 1} / ${m.sections.length}</span>` +
      `<h1 tabindex="-1">${esc(sec.name)}</h1></div>` +
      `<span class="answeredCount">${answered} / ${sec.ids.length}</span>` + A.rubyToggleHtml() +
      `<span class="timer" id="timer" role="timer" aria-label="本節剩餘時間">${clock(remainingMs(sec))}</span>` +
      '<button type="button" class="secondary" data-action="mock-submit">交卷本節</button></div>' +
      navHtml(sec, index) +
      `<section class="panel questionPanel"><p class="hint">第 ${index + 1} 題<span class="kbdHint">・鍵盤 1–4 作答、← → 換題、F 標記</span></p>` +
      A.questionHtml(q, {order: sec.orders[id], chosen: sec.answers[id], reveal: false, after: controls}) +
      '</section></div>';
  }

  function runView() {
    const m = mock();
    if (!m) {
      return A.pageHead('沒有進行中的模考', 'Mock exam', '') + '<p><a href="#mock">回模擬考首頁</a></p>';
    }
    const sec = section();
    if (!sec.started) return intro(m, sec);
    resumeClock();
    if (remainingMs(sec) <= 0) {
      setTimeout(() => submitSection(true));
      return '<p class="hint">時間到，正在交卷…</p>';
    }
    setTimeout(startTick);
    return examView(m, sec);
  }

  function reviewView() {
    const m = Store.state.lastMock;
    if (!m?.summary) return A.pageHead('沒有可檢討的模考', 'Review', '') + '<p><a href="#mock">回模擬考首頁</a></p>';
    const s = m.summary;
    const spec = pack.mocks[m.kind];
    let html = A.pageHead(`${spec.name}成績`, 'Mock result', esc(s.date));
    html += '<section class="panel mockResult"><div class="scoreRow">' + s.sections.map(x =>
      `<div class="sectionScore"><span>${esc(x.name)}</span><strong>${x.score ?? '—'}<small> / ${PASS.sectionMax}</small></strong>` +
      `<em>${x.correct} / ${x.total} 題・${pct(x.correct, x.total)}%</em>` +
      `${x.score !== null && x.score < PASS.section ? '<b class="below">未達基準分 19</b>' : ''}</div>`).join('') +
      `<div class="sectionScore total"><span>粗估總分</span><strong>${s.total}<small> / 180</small></strong>` +
      `<span class="stamp big ${s.pass ? 'ok' : ''}" aria-label="${s.pass ? '合格水準' : '未達合格水準'}">${s.pass ? '合' : '未'}</span></div></div>` +
      `<p class="disclaimer">※ 僅供參考，非正式換算：每節以正確率線性換算成 60 分。正式 JLPT 採等化計分，${m.kind === 'mini' ? '迷你模考題數少，誤差更大。' : '實際分數可能不同。'}` +
      `合格判定參考：總分 ≥ ${PASS.total} 且每節 ≥ ${PASS.section}。</p>` +
      '<div class="actions"><a class="primary" href="#mock">回模擬考首頁</a><a class="secondary" href="#mistakes">錯題本</a></div></section>';
    const all = m.sections.flatMap(sec => sec.ids.map(id => ({q: A.byId.get(id), sec})).filter(x => x.q));
    html += A.sectionTitle('各題型成績', 'By type') +
      `<section class="panel">${A.typeScoreTable(all.map(({q, sec}) => ({q, ok: sec.answers[q.id] === q.answer})))}</section>`;
    html += A.sectionTitle('逐題檢討', 'Item review',
      '<button type="button" class="textBtn" data-action="review-filter" aria-pressed="false">只看錯題</button>' + A.rubyToggleHtml());
    html += '<div class="reviewList">' + m.sections.map(sec => {
      const items = sec.ids.map((id, i) => ({q: A.byId.get(id), i})).filter(x => x.q);
      if (!items.length) return '';
      return `<h3 class="reviewSection">${esc(sec.name)}</h3>` + items.map(({q, i}) =>
        A.reviewHtml(q, {order: sec.orders[q.id], chosen: sec.answers[q.id], index: i})).join('');
    }).join('') + '</div>';
    return html;
  }

  // ---------- actions ----------
  function choose(pos) {
    const sec = section();
    if (!sec?.started || !sec.resumedAt) return;
    const id = sec.ids[mock().index];
    const orig = sec.orders[id]?.[pos];
    if (orig === undefined) return;
    sec.answers[id] = orig;
    Store.save();
    // Update in place so audio playback and scroll position are not disturbed.
    document.querySelectorAll('.choices .answer').forEach((btn, i) => {
      const on = i === pos;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    const navBtn = document.querySelector(`.qNav [data-index="${mock().index}"]`);
    if (navBtn) {
      navBtn.classList.add('done');
      navBtn.setAttribute('aria-label', navBtn.getAttribute('aria-label').replace('未作答', '已作答'));
    }
    const count = document.querySelector('.answeredCount');
    if (count) count.textContent = `${Object.keys(sec.answers).length} / ${sec.ids.length}`;
  }

  function move(index) {
    const sec = section();
    if (!sec || index < 0 || index >= sec.ids.length) return;
    mock().index = index;
    Store.save();
    A.render();
    document.querySelector('.qNav [aria-current]')?.focus({preventScroll: true});
  }

  function toggleFlag() {
    const sec = section();
    const id = sec?.ids[mock().index];
    if (!id) return;
    if (sec.flags[id]) delete sec.flags[id];
    else sec.flags[id] = true;
    Store.save();
    A.render({keepScroll: true});
  }

  Object.assign(A.actions, {
    'mock-start': el => start(el.dataset.kind),
    'mock-begin': beginSection,
    'mock-submit': () => submitSection(false),
    'mock-jump': el => move(Number(el.dataset.index)),
    'mock-move': el => move(mock().index + Number(el.dataset.step)),
    'mock-flag': toggleFlag,
    'mock-abandon': () => {
      if (!confirm('確定放棄這回模考？已作答的內容不會計分。')) return;
      Store.state.mock = null;
      Store.save();
      A.render();
    },
    'review-filter': el => {
      const on = el.getAttribute('aria-pressed') !== 'true';
      el.setAttribute('aria-pressed', String(on));
      document.querySelector('.reviewList')?.classList.toggle('onlyMiss', on);
    }
  });

  A.routes.mock = ([sub]) => (sub === 'run' ? runView() : sub === 'review' ? reviewView() : landing());

  A.keys.mock = (event, [sub]) => {
    if (sub !== 'run') return false;
    const sec = section();
    if (!sec?.started) return false;
    const k = event.key;
    if (/^[1-4]$/.test(k)) { choose(Number(k) - 1); return true; }
    if (k === 'ArrowRight' || k === 'Enter') { move(mock().index + 1); return true; }
    if (k === 'ArrowLeft') { move(mock().index - 1); return true; }
    if (k.toLowerCase() === 'f') { toggleFlag(); return true; }
    if (k.toLowerCase() === 'p') { A.playAudio(); return true; }
    return false;
  };
  // Answer clicks are routed here while on the exam page.
  A.mockChoose = choose;

  // Called by the router before every render and when the tab is hidden.
  A.mockLeave = onExamPage => {
    stopTick();
    if (!onExamPage) pauseClock();
  };
  A.mockPause = pauseClock;
  A.mockBuild = buildMock;
})();
