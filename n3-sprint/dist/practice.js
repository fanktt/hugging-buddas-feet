// Practice sessions: today's sprint, category/type drills and mistake review.
(() => {
  const A = globalThis.App;
  const {pack, Store, esc, pct} = A;

  // ---------- session construction ----------
  function makeSession(key, title, list, params = {}) {
    const ids = list.map(q => q.id);
    const orders = {};
    for (const q of list) orders[q.id] = A.permutation(q.options.length);
    return {key, title, params, ids, orders, answers: [], index: 0, done: false, created: Store.today()};
  }

  // Splits `total` across categories by weight (largest remainder), skipping empty ones.
  function quotas(total) {
    const cats = pack.categories.filter(c => A.byCat[c.id]?.length);
    const weight = cats.reduce((n, c) => n + c.weight, 0);
    const raw = cats.map(c => ({id: c.id, exact: total * c.weight / weight}));
    raw.forEach(r => { r.n = Math.floor(r.exact); });
    let left = total - raw.reduce((n, r) => n + r.n, 0);
    [...raw].sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).forEach(r => { if (left > 0) { r.n++; left--; } });
    return raw;
  }

  // Today's sprint: due reviews → new items of weak types → other new items → filler,
  // keeping the subject mix and passage groups together.
  function buildDaily() {
    const st = A.stats();
    const weakTypes = new Set(st.weak.filter(w => w.acc < 0.75).slice(0, 4).map(w => w.type));
    const taken = new Set();
    const perCat = [];
    for (const {id, n} of quotas(pack.sprintSize)) {
      const t = A.tiers(A.byCat[id]);
      const tierLists = [
        t.due,
        t.fresh.filter(q => weakTypes.has(q.type)),
        t.fresh.filter(q => !weakTypes.has(q.type)),
        t.seen
      ];
      const picked = [[], [], [], []];
      let size = 0;
      tierLists.forEach((list, tier) => {
        if (size >= n) return;
        const got = A.takeUnits(list, n - size, taken);
        picked[tier].push(...got.units);
        size += got.size;
      });
      perCat.push(picked);
    }
    // Tier by tier, alternate categories so the mix stays even.
    const out = [];
    for (let tier = 0; tier < 4; tier++) {
      const lanes = perCat.map(p => [...p[tier]]);
      while (lanes.some(l => l.length)) {
        for (const lane of lanes) if (lane.length) out.push(...lane.shift());
      }
    }
    return out;
  }

  function buildDrill(cat, type, n) {
    const pool = type ? A.byType[type] || [] : A.byCat[cat] || [];
    return A.takeUnits(A.ranked(pool), n).units.flat();
  }

  function mistakePool(cat, type) {
    const rec = Store.state.records;
    return A.questions.filter(q => rec[q.id]?.miss && (!cat || q.cat === cat) && (!type || q.type === type));
  }
  function buildMistakes(cat, type) {
    const pool = mistakePool(cat, type);
    const rec = Store.state.records;
    pool.sort((a, b) => rec[a.id].due.localeCompare(rec[b.id].due));
    return A.takeUnits(pool, pack.sprintSize).units.flat()
      // Only keep group-mates that are mistakes too, but keep their order.
      .filter(q => rec[q.id]?.miss);
  }

  function open(key) {
    const hash = '#practice/' + key;
    if (location.hash === hash) A.render();
    else location.hash = hash;
  }

  function startDaily(forceNew = false) {
    const s = Store.state.sessions.daily;
    if (!forceNew && s && !s.done && s.created === Store.today()) return open('daily');
    const list = buildDaily();
    if (!list.length) return alert('題庫準備中，暫時沒有可練習的題目。');
    Store.state.sessions.daily = makeSession('daily', '今日衝刺', list);
    Store.save();
    open('daily');
  }

  function startDrill(cat, type, n) {
    const list = buildDrill(cat, type, n);
    if (!list.length) return alert('這個題型還在準備中。');
    const c = A.category(cat);
    const title = (type || c?.name + '綜合') + ' 特訓';
    Store.state.sessions.drill = makeSession('drill', title, list, {cat, type, n});
    Store.save();
    open('drill');
  }

  function startMistakes(cat = '', type = '') {
    const list = buildMistakes(cat, type);
    if (!list.length) return alert('目前沒有符合條件的錯題。');
    Store.state.sessions.mistakes = makeSession('mistakes', '錯題重練', list, {cat, type});
    Store.save();
    open('mistakes');
  }

  function restart(s) {
    if (s.key === 'daily') startDaily(true);
    else if (s.key === 'drill') startDrill(s.params.cat, s.params.type, s.params.n);
    else startMistakes(s.params.cat, s.params.type);
  }

  // ---------- views ----------
  function currentSession(key) {
    const s = Store.state.sessions[key];
    if (!s) return null;
    if (!s.ids.every(id => A.byId.has(id))) {
      // The bank changed under this session; drop it rather than show broken items.
      delete Store.state.sessions[key];
      Store.save();
      return null;
    }
    return s;
  }

  function sessionView(key) {
    const s = currentSession(key);
    if (!s) {
      return A.pageHead('找不到這回練習', 'Session', '這回練習可能已結束或題庫有更新。') +
        '<p><a href="#home">回到作戰板</a></p>';
    }
    return s.done ? resultView(s) : questionView(s);
  }

  function questionView(s) {
    const q = A.byId.get(s.ids[s.index]);
    const a = s.answers[s.index];
    const answered = Boolean(a);
    const last = s.index + 1 === s.ids.length;
    let after = '';
    if (answered) {
      const box = Store.state.records[q.id]?.box ?? 0;
      const due = Store.state.records[q.id]?.due;
      const status = a.ok
        ? (a.guessed ? '已標記為猜的，明天會再出現。' : `記住了！升到第 ${box} 盒，${due ? A.fmtDate(due) : ''} 再複習。`)
        : '已收進錯題本，明天會再出現。';
      // Verdict and the next button sit on one row right under the choices;
      // the explanation follows. On phones the button row sticks to the bottom.
      after = `<div class="feedback ${a.ok && !a.guessed ? 'ok' : 'miss'}">` +
        `<div class="feedbackHead"><p class="verdictLine" role="status"><strong>${a.ok ? (a.guessed ? '答對（猜的）' : '答對了') : '答錯了'}</strong>` +
        `<span class="boxNote">${esc(status)}</span></p>` +
        `<div class="actions nextBar">` +
        (a.ok && !a.guessed ? '<button type="button" class="secondary" data-action="guess">我是猜的</button>' : '') +
        `<button type="button" class="primary" data-action="next" id="nextBtn">${last ? '查看本回成績' : '下一題'}<span class="kbd" aria-hidden="true">Enter</span></button>` +
        '</div></div>' +
        `<p class="explain">${A.rb.explanation(q)}</p></div>`;
    }
    const done = s.answers.filter(Boolean).length;
    return `<div class="practice${q.passage ? ' wide' : ''}">` +
      `<div class="sessionHead"><h1 tabindex="-1">${esc(s.title)}</h1>` +
      `<span class="progressNum">第 ${s.index + 1} / ${s.ids.length} 題</span>` +
      `<div class="headTools">${A.rubyToggleHtml()}<a class="pause" href="#home">暫停</a></div></div>` +
      A.track(done / s.ids.length * 100, '本回進度') +
      `<section class="panel questionPanel">${A.questionHtml(q, {order: s.orders[q.id], chosen: a?.choice, reveal: answered, after})}</section>` +
      '</div>';
  }

  function resultView(s) {
    const items = s.ids.map((id, i) => ({q: A.byId.get(id), a: s.answers[i] || {}}));
    const correct = items.filter(x => x.a.ok && !x.a.guessed).length;
    const misses = items.map((x, i) => ({...x, i})).filter(x => !x.a.ok || x.a.guessed);
    const again = s.key === 'mistakes' && !mistakePool(s.params.cat, s.params.type).length ? '' :
      `<button type="button" class="primary" data-action="restart" data-key="${esc(s.key)}">再來一回</button>`;
    return '<div class="practice">' +
      A.pageHead('本回練習完成', 'Session results', esc(s.title)) +
      `<section class="panel resultPanel"><p class="bigScore"><strong>${correct}</strong><span> / ${s.ids.length} 題答對</span></p>` +
      `<div><h2>正確率 ${pct(correct, s.ids.length)}%</h2><p class="sub">猜對的題目不算掌握，會和錯題一起在明天複習。</p>` +
      `<div class="actions">${again}<a class="secondary" href="#mistakes">錯題本</a><a class="secondary" href="#home">回作戰板</a></div></div></section>` +
      A.sectionTitle('各題型成績', 'By type') +
      `<section class="panel">${A.typeScoreTable(items.map(x => ({q: x.q, ok: x.a.ok && !x.a.guessed})))}</section>` +
      A.sectionTitle('本回錯題', 'Review', (misses.length ? `${misses.length} 題` : '') + A.rubyToggleHtml()) +
      (misses.length
        ? misses.map(x => A.reviewHtml(x.q, {order: s.orders[x.q.id], chosen: x.a.choice, guessed: x.a.guessed, index: x.i})).join('')
        : '<div class="panel empty"><h2>全對！</h2><p class="sub">本回沒有錯題，保持這個節奏。</p></div>') +
      '</div>';
  }

  // ---------- actions ----------
  const activeSession = () => {
    const [page, key] = location.hash.slice(1).split('/');
    if (page !== 'practice') return null;
    const s = Store.state.sessions[key];
    return s && !s.done ? s : null;
  };

  function choose(pos) {
    const s = activeSession();
    if (!s || s.answers[s.index]) return;
    const q = A.byId.get(s.ids[s.index]);
    const choice = s.orders[q.id][pos];
    if (choice === undefined) return;
    const ok = choice === q.answer;
    const prev = Store.grade(q.id, ok);
    s.answers[s.index] = {choice, ok, guessed: false, prevBox: prev ? prev.box : 0};
    Store.save();
    A.render({keepScroll: true});
    const next = document.getElementById('nextBtn');
    next?.focus({preventScroll: true});
    document.querySelector('.feedback')?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }

  function next() {
    const s = activeSession();
    if (!s || !s.answers[s.index]) return;
    if (s.index + 1 >= s.ids.length) s.done = true;
    else s.index++;
    Store.save();
    A.render();
    window.scrollTo(0, 0);
    if (!s.done) document.querySelector('[data-action="answer"]')?.focus({preventScroll: true});
  }

  Object.assign(A.actions, {
    'start-daily': () => startDaily(),
    'start-drill': el => {
      const form = el.closest('form') || document;
      const type = form.querySelector('input[name="type"]:checked')?.value || '';
      const n = Number(form.querySelector('input[name="count"]:checked')?.value || 20);
      startDrill(el.dataset.cat, type, n);
    },
    'resume': el => open(el.dataset.key),
    'start-mistakes': () => {
      const cat = document.getElementById('mistakeCat')?.value || '';
      const type = document.getElementById('mistakeType')?.value || '';
      startMistakes(cat, type);
    },
    'answer': el => {
      if (location.hash.startsWith('#practice/')) choose(Number(el.dataset.pos));
      else if (location.hash === '#mock/run') A.mockChoose?.(Number(el.dataset.pos));
    },
    'next': next,
    'guess': () => {
      const s = activeSession();
      const a = s?.answers[s.index];
      if (!a || !a.ok || a.guessed) return;
      Store.markGuessed(s.ids[s.index], {box: a.prevBox});
      a.guessed = true;
      Store.save();
      A.render({keepScroll: true});
      document.getElementById('nextBtn')?.focus({preventScroll: true});
    },
    'restart': el => {
      const s = Store.state.sessions[el.dataset.key];
      if (s) restart(s);
    }
  });

  A.routes.practice = ([key]) => sessionView(key);
  A.keys.practice = event => {
    const s = activeSession();
    if (!s) return false;
    if (/^[1-4]$/.test(event.key)) { choose(Number(event.key) - 1); return true; }
    if (event.key === 'Enter') { next(); return true; }
    if (event.key.toLowerCase() === 'p') { A.playAudio(); return true; }
    return false;
  };

  A.practice = {startDaily, startDrill, startMistakes, mistakePool, buildDaily, buildDrill};
})();
