// Router and the remaining pages: 作戰板 (home), subject pages, 錯題本, 設定.
(() => {
  const A = globalThis.App;
  const {pack, Store, Speech, esc, pct} = A;
  const app = document.getElementById('app');
  const settings = () => Store.state.settings;
  let showMigrated = Store.migrated;
  const mistakeFilter = {cat: '', type: ''};
  const MISTAKE_LIMIT = 150;

  // ---------- home ----------
  // Top of the page: start button plus three compact numbers (due, today, countdown).
  function countdownStat() {
    const days = Store.daysToExam();
    const date = settings().examDate;
    const weekday = '日一二三四五六'[new Date(date + 'T00:00:00').getDay()];
    if (days < 0) {
      return '<li class="stat"><span class="statLabel">考試日</span><b class="statNum">已過</b>' +
        '<a class="statSub" href="#settings">更新考試日</a></li>';
    }
    return `<li class="stat"><span class="statLabel">距考試</span>` +
      `<b class="statNum">${days === 0 ? '就是今天' : `${days}<small> 天</small>`}</b>` +
      `<span class="statSub"><span class="year">${esc(date.slice(0, 5).replace('-', '.'))}</span>${esc(date.slice(5).replace('-', '.'))}（${weekday}）</span></li>`;
  }

  function home() {
    const st = A.stats();
    const s = Store.state;
    const doneToday = s.days[Store.today()] || 0;
    const goal = settings().dailyGoal;
    const streak = Store.streak();
    const daily = s.sessions.daily;
    const resume = daily && !daily.done && daily.created === Store.today();
    const answeredInDaily = resume ? daily.answers.filter(Boolean).length : 0;
    const misses = A.questions.reduce((n, q) => n + (s.records[q.id]?.miss ? 1 : 0), 0);

    let html = '';
    if (showMigrated) {
      html += '<p class="notice">已把舊版的練習紀錄搬到新版：答錯過的題目今天就會出現在複習裡。</p>';
      showMigrated = false;
    }
    html += '<section class="today">' +
      '<div class="todayMain"><h1 tabindex="-1">今日衝刺</h1>' +
      `<p class="sub">每回 ${pack.sprintSize} 題：到期複習 → 弱點題型新題 → 其他新題，四科輪流出。</p>` +
      '<button type="button" class="primary big" data-action="start-daily">' +
      `${resume ? `繼續今日衝刺<small>${answeredInDaily} / ${daily.ids.length}</small>` : '開始今日衝刺'}</button></div>` +
      '<ul class="statRow">' +
      `<li class="stat"><span class="statLabel">到期複習</span><b class="statNum">${st.due}<small> 題</small></b>` +
      `<span class="statSub">${st.due ? '會排在衝刺最前面' : '目前沒有到期'}</span></li>` +
      `<li class="stat"><span class="statLabel">今日進度</span><b class="statNum">${doneToday}<small> / ${goal} 題</small></b>` +
      `${A.track(doneToday / goal * 100, '今日目標進度')}<span class="statSub">連續 ${streak} 天</span></li>` +
      countdownStat() + '</ul></section>';

    html += A.sectionTitle('四科掌握度', 'Subjects', `題庫共 ${A.byId.size} 題`);
    html += '<div class="cards four">' + pack.categories.map(c => {
      const cs = st.cats[c.id];
      const name = `<h3><span class="dot" aria-hidden="true"></span>${esc(c.name)}</h3>`;
      if (!cs) {
        return `<div class="card cat-${c.id} pending"><div class="cardHead">${name}</div>` +
          `<p class="cardFoot">題目準備中</p></div>`;
      }
      return `<a class="card cat-${c.id}" href="#cat/${c.id}"><div class="cardHead">${name}` +
        `<span class="mastery"><b>${pct(cs.mastered, cs.total)}%</b> 掌握</span></div>` +
        `<div class="track dual" role="img" aria-label="已掌握 ${cs.mastered} 題，已做過 ${cs.seen} 題，共 ${cs.total} 題">` +
        `<i class="seen" style="width:${pct(cs.seen, cs.total)}%"></i><i style="width:${pct(cs.mastered, cs.total)}%"></i></div>` +
        `<p class="cardFoot"><span>已做 ${cs.seen} / ${cs.total}</span><span>正確率 ${cs.count ? pct(cs.correct, cs.count) + '%' : '—'}</span>` +
        `${cs.due ? `<em>到期 ${cs.due}</em>` : ''}</p></a>`;
    }).join('') + '</div>';

    html += '<div class="split2">';
    html += '<section>' + A.sectionTitle('弱點題型', 'Weak spots');
    const weak = st.weak.slice(0, 5);
    html += weak.length
      ? '<ol class="weakList">' + weak.map(w => {
        const t = A.typeInfo(w.type);
        return `<li><div class="weakName"><b>${esc(w.type)}</b><small>${esc(A.category(t.cat)?.shortName || '')}・作答 ${w.count} 次</small></div>` +
          `<span class="miniBar ${w.acc < 0.6 ? 'bad' : ''}"><i style="width:${Math.round(w.acc * 100)}%"></i></span>` +
          `<span class="weakPct">${Math.round(w.acc * 100)}%</span>` +
          `<button type="button" class="secondary small" data-action="start-drill" data-cat="${esc(t.cat)}" data-type="${esc(w.type)}" data-n="10">練 10 題</button></li>`;
      }).join('') + '</ol>'
      : `<p class="emptyLine">同一題型作答滿 ${st.minSample} 次後，正確率最低的題型會排在這裡。</p>`;
    html += '</section>';

    const last = s.mockHistory[s.mockHistory.length - 1];
    const notesCount = A.notes.length;
    const link = (href, name, note) => `<li><a href="${href}"><b>${name}</b><small>${note}</small></a></li>`;
    html += '<section>' + A.sectionTitle('其他入口', 'More') + '<ul class="linkList">' +
      link('#mock', '模擬考', last ? `上回 ${esc(last.total)} / 180` : '迷你 25 分・完整三節') +
      link('#notes/grammar', '佛腳筆記', notesCount ? `${notesCount} 則・閃卡` : '準備中') +
      link('#mistakes', '錯題本', `${misses} 題待複習`) + '</ul></section>';
    html += '</div>';
    return html;
  }

  // ---------- subject page ----------
  function subject([catId]) {
    const c = A.category(catId);
    if (!c) return notFound();
    const st = A.stats();
    const cs = st.cats[c.id] || {total: 0, seen: 0, mastered: 0, count: 0, correct: 0, due: 0};
    const drill = Store.state.sessions.drill;
    let html = A.pageHead(c.name + '特訓', c.english, esc(c.desc));
    if (drill && !drill.done && drill.params.cat === c.id) {
      html += `<section class="panel resume"><div><span class="tag">未完成</span><h2>${esc(drill.title)}</h2>` +
        `<p class="sub">已作答 ${drill.answers.filter(Boolean).length} / ${drill.ids.length} 題</p></div>` +
        '<button type="button" class="primary" data-action="resume" data-key="drill">繼續上次特訓</button></section>';
    }
    html += `<section class="stats"><div class="metric"><label>掌握</label><strong>${pct(cs.mastered, cs.total)}<small> %</small></strong></div>` +
      `<div class="metric"><label>已做 / 題數</label><strong>${cs.seen}<small> / ${cs.total}</small></strong></div>` +
      `<div class="metric"><label>正確率</label><strong>${cs.count ? pct(cs.correct, cs.count) + '<small> %</small>' : '—'}</strong></div>` +
      `<div class="metric"><label>到期複習</label><strong>${cs.due}<small> 題</small></strong></div></section>`;

    const types = A.typesOf(c.id);
    html += `<form class="drillForm" onsubmit="return false"><fieldset><legend>${A.sectionTitle('選擇題型', 'Question types')}</legend>` +
      '<div class="typeRows">' +
      `<label class="typeRow all"><input type="radio" name="type" value="" checked${cs.total ? '' : ' disabled'}>` +
      `<span class="typeName"><b>全部題型混合</b><small>依複習優先度出題</small></span>` +
      `<span class="typeNum">${cs.total} 題</span><span class="typeNum">已做 ${cs.seen}</span>` +
      `<span class="typeNum">${cs.count ? pct(cs.correct, cs.count) + '%' : '—'}</span></label>` +
      types.map(t => {
        const ts = st.types[t.name];
        if (!ts) {
          return `<label class="typeRow pending"><input type="radio" name="type" value="${esc(t.name)}" disabled>` +
            `<span class="typeName"><b>${esc(t.name)}</b><small lang="ja">${esc(t.ja)}</small></span>` +
            '<span class="typeNum wideCell">準備中</span></label>';
        }
        return `<label class="typeRow"><input type="radio" name="type" value="${esc(t.name)}">` +
          `<span class="typeName"><b>${esc(t.name)}</b><small lang="ja">${esc(t.ja)}</small></span>` +
          `<span class="typeNum">${ts.total} 題</span><span class="typeNum">已做 ${ts.seen}</span>` +
          `<span class="typeNum">${ts.count ? pct(ts.correct, ts.count) + '%' : '—'}</span></label>`;
      }).join('') + '</div></fieldset>' +
      '<fieldset class="countPick"><legend>題數</legend>' +
      [10, 20, 30].map(n => `<label><input type="radio" name="count" value="${n}"${n === 20 ? ' checked' : ''}><span>${n} 題</span></label>`).join('') +
      '</fieldset><p class="hint">讀解與文章文法以整篇為單位出題，題數可能略多。</p>' +
      `<button type="button" class="primary big" data-action="start-drill" data-cat="${c.id}"${cs.total ? '' : ' disabled'}>` +
      '<span class="play" aria-hidden="true">▶</span>開始特訓</button></form>';
    return html;
  }

  // ---------- mistakes ----------
  function boxLabel(r) {
    if (!r) return '';
    const due = r.due <= Store.today() ? '今天到期' : `${A.fmtDate(r.due)} 到期`;
    return `<span class="boxState box${r.box}" title="Leitner 第 ${r.box} 盒">` +
      `<span class="boxDots" aria-hidden="true">${'●'.repeat(r.box)}${'○'.repeat(Store.MAX_BOX - r.box)}</span>` +
      `第 ${r.box} 盒・${due}・答對 ${r.correct}/${r.count}</span>`;
  }

  function mistakeEntry(entry) {
    const q = A.question(entry.id);
    const r = Store.state.records[q.id];
    const {instruction, stem} = A.splitPrompt(q);
    return `<article class="entry mistake"><div class="reviewHead"><span class="tag">${esc(q.type)}</span>${boxLabel(r)}</div>` +
      (instruction ? `<p class="instruction" lang="ja">${A.rb.instruction(q, instruction)}</p>` : '') +
      `<p class="reviewPrompt" lang="ja">${A.promptHtml(q, stem)}</p>` +
      '<details><summary>查看選項與解析</summary>' +
      (q.passage ? `<div class="passage" lang="ja">${A.rb.passage(q)}</div>` : '') +
      (q.audio ? A.scriptHtml(q, q.options.map((_, i) => i)) : '') +
      '<ol class="optionList">' + q.options.map((o, i) =>
        `<li class="${i === q.answer ? 'right' : ''}" lang="ja">${A.rb.option(q, i)}${i === q.answer ? ' <em>正解</em>' : ''}</li>`).join('') + '</ol>' +
      `<p class="explain">${A.rb.explanation(q)}</p></details></article>`;
  }

  function mistakesPage() {
    const {cat, type} = mistakeFilter;
    const all = A.practice.mistakePool('', '');
    const list = A.practice.mistakePool(cat, type);
    const active = Store.state.sessions.mistakes;
    const typeOptions = (cat ? A.typesOf(cat) : pack.types).filter(t => A.byType[t.name]);
    let html = A.pageHead('錯題本', 'Review notebook', '答錯或標記「我是猜的」的題目會收在這裡；再次答對就會移出，並依間隔複習排程。');
    if (active && !active.done) {
      html += `<section class="panel resume"><div><span class="tag">未完成</span><h2>錯題重練</h2>` +
        `<p class="sub">已作答 ${active.answers.filter(Boolean).length} / ${active.ids.length} 題</p></div>` +
        '<button type="button" class="primary" data-action="resume" data-key="mistakes">繼續重練</button></section>';
    }
    html += '<div class="filters">' +
      '<label>科目<select id="mistakeCat"><option value="">全部科目</option>' +
      pack.categories.map(c => `<option value="${c.id}"${c.id === cat ? ' selected' : ''}>${esc(c.name)}</option>`).join('') +
      '</select></label>' +
      '<label>題型<select id="mistakeType"><option value="">全部題型</option>' +
      typeOptions.map(t => `<option value="${esc(t.name)}"${t.name === type ? ' selected' : ''}>${esc(t.name)}</option>`).join('') +
      '</select></label>' +
      `<span class="hint">符合 ${list.length} 題／共 ${all.length} 題</span>` + A.rubyToggleHtml() +
      (list.length ? `<button type="button" class="primary" data-action="start-mistakes">重練這些錯題（最多 ${pack.sprintSize} 題）</button>` : '') +
      '</div>';
    if (!list.length) {
      html += `<div class="panel empty"><h2>${all.length ? '這個篩選條件下沒有錯題' : '目前沒有待複習的錯題'}</h2>` +
        '<p class="sub">完成練習後，答錯的題目會出現在這裡。</p>' +
        '<button type="button" class="primary" data-action="start-daily">開始今日衝刺</button></div>';
      return html;
    }
    html += list.slice(0, MISTAKE_LIMIT).map(mistakeEntry).join('');
    if (list.length > MISTAKE_LIMIT) html += `<p class="hint">只顯示前 ${MISTAKE_LIMIT} 題，請用篩選縮小範圍。</p>`;
    return html;
  }

  // ---------- settings ----------
  function settingsPage() {
    const st = settings();
    const speech = Speech.status();
    const speechText = {ok: '可用（已找到日語語音）', loading: '載入中…', novoice: '找不到日語語音，聽解會改成文字稿', unsupported: '此瀏覽器不支援，聽解會改成文字稿'}[speech];
    return A.pageHead('設定', 'Settings', '') +
      '<section class="panel settings"><h2>考試與目標</h2>' +
      `<label class="field"><span>考試日</span><input type="date" id="examDate" value="${esc(st.examDate)}" required></label>` +
      `<p class="hint">預設為下一個 JLPT 日期（7 月或 12 月的第一個星期日）。間隔複習的間隔不會超過距考試天數的一半。</p>` +
      `<label class="field"><span>每日目標（題）</span><input type="number" id="dailyGoal" min="5" max="500" step="5" value="${st.dailyGoal}"></label>` +
      '</section>' +
      '<section class="panel settings"><h2>顯示</h2>' +
      `<label class="check"><input type="checkbox" id="furigana"${A.rubyOn() ? ' checked' : ''}>` +
      '<span>漢字顯示假名注音<small>在題目、選項、本文、文字稿、解析引用與筆記例句的漢字上方顯示讀音（ふりがな）。' +
      '作答、模擬考與筆記頁也有「あ 注音」快速切換鈕。漢字讀音題的考點不會標注。</small></span></label>' +
      '</section>' +
      '<section class="panel settings"><h2>聽解語音</h2>' +
      `<p>語音合成：${esc(speechText)}</p>` +
      '<div class="field"><span>預設語速</span><span class="rate" role="group" aria-label="語速">' +
      [0.8, 1].map(r => `<button type="button" data-action="audio-rate" data-rate="${r}" aria-pressed="${st.rate === r}">${r.toFixed(1)}×</button>`).join('') +
      '</span></div></section>' +
      '<section class="panel settings"><h2>進度資料</h2>' +
      (Store.storageOk ? '<p class="sub">進度存在這台裝置的瀏覽器裡。換裝置或清除瀏覽資料前，請先匯出備份。</p>'
        : '<p class="warn">此瀏覽器目前無法保存進度，請記得匯出備份。</p>') +
      '<div class="actions"><button type="button" class="secondary" data-action="export">匯出進度 JSON</button>' +
      '<label class="secondary fileBtn">匯入進度 JSON<input type="file" id="importFile" accept="application/json,.json"></label>' +
      '<button type="button" class="danger" data-action="reset">清除所有進度</button></div></section>';
  }

  function exportProgress() {
    const data = JSON.stringify({app: 'study-sprint', topic: pack.id, exported: new Date().toISOString(), state: Store.state}, null, 1);
    const url = URL.createObjectURL(new Blob([data], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = `n3-sprint-progress-${Store.today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importProgress(file) {
    try {
      const raw = JSON.parse(await file.text());
      const state = raw && raw.state ? raw.state : raw;
      if (!state || typeof state !== 'object' || typeof state.records !== 'object') throw new Error('shape');
      const n = Object.keys(state.records).length;
      if (!confirm(`檔案內有 ${n} 題的作答紀錄。匯入會覆蓋目前的進度，確定嗎？`)) return;
      Store.replace(state);
      render();
      announce('已匯入進度。');
    } catch {
      alert('無法讀取這個檔案，請確認是從本站匯出的進度 JSON。');
    }
  }

  function notFound() {
    return A.pageHead('找不到這個頁面', 'Not found', '網址可能打錯了，或這個頁面已經不存在。') +
      '<p><a class="primary" href="#home">回到作戰板</a></p>';
  }

  // ---------- router ----------
  Object.assign(A.routes, {
    home, cat: subject, mistakes: mistakesPage, settings: settingsPage
  });
  A.needs.mistakes = () => A.practice.mistakePool(mistakeFilter.cat, mistakeFilter.type)
    .slice(0, MISTAKE_LIMIT).map(q => q.id);
  const NAV_OF = {home: 'home', cat: 'home', practice: 'home', mock: 'mock', notes: 'notes', flash: 'notes',
    mistakes: 'mistakes', settings: 'settings'};

  function parts() {
    const [page, ...args] = location.hash.slice(1).split('/').map(decodeURIComponent);
    return [A.routes[page] ? page : (page ? '404' : 'home'), args];
  }

  // Pages that show question or note text declare it in A.needs; render() loads the
  // files first. While loading, the old page stays (inert) and a quiet "載入中…" appears
  // only if loading takes longer than LOADING_DELAY. A newer render always wins.
  // opts: keepScroll, top (scroll to top), after (called once the page is drawn).
  const LOADING_DELAY = 250;
  let renderSeq = 0;
  let loadingTimer = null;
  let status = 'ok';  // 'ok' | 'busy' (loading) | 'error' (load failed)
  let retryOpts = {};
  function setStatus(next) {
    status = next;
    if (next === 'busy') app.setAttribute('aria-busy', 'true');
    else app.removeAttribute('aria-busy');
  }
  const banner = () => (Store.storageOk ? '' :
    '<p class="warn" role="alert">此瀏覽器無法保存進度（可能是無痕模式或停用了儲存空間），關閉頁面後紀錄會遺失。可到「設定」匯出備份。</p>');
  function markNav(page) {
    const current = NAV_OF[page];
    document.querySelectorAll('header nav a').forEach(a => {
      if (a.dataset.nav === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function draw(page, args, opts) {
    let body;
    try {
      body = page === '404' ? notFound() : A.routes[page](args);
    } catch (error) {
      console.error(error);
      body = '<div class="panel"><h2>這個頁面出了點問題</h2><p class="sub">請回到作戰板再試一次。</p><a href="#home">回作戰板</a></div>';
    }
    app.innerHTML = banner() + body;
    markNav(page);
    if (opts.top) window.scrollTo(0, 0);
    else if (opts.keepScroll) window.scrollTo(0, opts.y);
    opts.after?.();
    if (page === 'home') prefetchDaily();
  }

  function render(opts = {}) {
    const [page, args] = parts();
    A.mockLeave?.(page === 'mock' && args[0] === 'run');
    Speech.stop();
    A.ui.audio = null;
    const seq = ++renderSeq;
    clearTimeout(loadingTimer);
    const o = {...opts, y: opts.y ?? window.scrollY};
    let need = [];
    try {
      need = (page !== '404' && A.needs[page]?.(args)) || [];
    } catch (error) {
      console.error(error);
    }
    if (A.loaded(need)) {
      setStatus('ok');
      draw(page, args, o);
      return Promise.resolve();
    }
    setStatus('busy');
    loadingTimer = setTimeout(() => {
      if (seq !== renderSeq) return;
      app.innerHTML = banner() + '<div class="loadState" role="status"><p>載入中…</p></div>';
      markNav(page);
    }, LOADING_DELAY);
    return A.load(need).then(() => {
      if (seq === renderSeq) return render(o);
    }, error => {
      if (seq !== renderSeq) return;
      clearTimeout(loadingTimer);
      console.error(error);
      setStatus('error');
      app.innerHTML = banner() + '<div class="panel loadError" role="alert"><h2>題目載入失敗</h2>' +
        '<p class="sub">可能是網路連線中斷。請確認連線後重試。</p>' +
        `<p class="hint">${esc((error.files || []).join('、'))}</p>` +
        '<div class="actions center"><button type="button" class="primary" data-action="retry-load">重試</button>' +
        '<a class="secondary" href="#home">回作戰板</a></div></div>';
      markNav(page);
      app.querySelector('[data-action="retry-load"]')?.focus({preventScroll: true});
      o.top = false;
      retryOpts = o;
    });
  }

  // While the home page is idle, fetch the files of the sprint its button would start
  // (only that sprint's files), so starting it is nearly instant.
  function prefetchDaily() {
    const seq = renderSeq;
    const run = () => {
      if (seq !== renderSeq || status !== 'ok') return;
      A.load(A.practice.prepareDaily()).catch(() => {});
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, {timeout: 3000});
    else setTimeout(run, 800);
  }
  A.render = render;

  function announce(text) {
    const el = document.getElementById('announcer');
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = text; }, 50);
  }
  A.announce = announce;

  // ---------- events ----------
  function setFurigana(on) {
    settings().furigana = on;
    if (on) globalThis.Bank.retryRuby();
    Store.save();
    announce(on ? '已開啟假名注音。' : '已關閉假名注音。');
  }
  Object.assign(A.actions, {
    'toggle-passage': el => {
      A.ui.passageCollapsed = !A.ui.passageCollapsed;
      const col = el.closest('.passageCol');
      col.classList.toggle('collapsed', A.ui.passageCollapsed);
      el.setAttribute('aria-expanded', String(!A.ui.passageCollapsed));
      el.querySelector('small').textContent = A.ui.passageCollapsed ? '展開' : '收合';
    },
    'audio-play': () => A.playAudio(),
    'audio-stop': () => A.stopAudio(),
    'audio-rate': el => {
      settings().rate = Number(el.dataset.rate);
      Store.save();
      el.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
    },
    'audio-text': () => {
      A.ui.textMode = !A.ui.textMode;
      render({keepScroll: true});
    },
    'toggle-ruby': () => {
      const on = !A.rubyOn();
      setFurigana(on);
      // Reflect the new state right away; turning furigana on may first load its files.
      document.querySelectorAll('[data-action="toggle-ruby"]').forEach(b => {
        b.setAttribute('aria-pressed', String(on));
        const label = b.querySelector('b');
        if (label) label.textContent = on ? '開' : '關';
      });
      render({keepScroll: true, after: () => document.querySelector('[data-action="toggle-ruby"]')?.focus({preventScroll: true})});
    },
    'retry-load': () => render(retryOpts),
    'export': exportProgress,
    'reset': () => {
      if (!confirm('確定清除所有作答紀錄、複習排程與模考紀錄？此動作無法復原（考試日與每日目標會保留）。')) return;
      Store.reset();
      render();
      announce('已清除所有進度。');
    }
  });
  // Drill buttons outside the subject form (weak-type shortcuts) carry their own type.
  const startDrillAction = A.actions['start-drill'];
  A.actions['start-drill'] = el => {
    if (el.dataset.type) A.practice.startDrill(el.dataset.cat, el.dataset.type, Number(el.dataset.n) || 10);
    else startDrillAction(el);
  };

  app.addEventListener('click', event => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) return;
    // While a page is loading (or failed to), the old page's controls are inert.
    if (status !== 'ok' && el.dataset.action !== 'retry-load') {
      event.preventDefault();
      return;
    }
    const fn = A.actions[el.dataset.action];
    if (fn) {
      event.preventDefault();
      fn(el, event);
    }
  });

  document.addEventListener('change', event => {
    const t = event.target;
    if (t.id === 'examDate') {
      if (Store.validDate(t.value)) {
        settings().examDate = t.value;
        Store.save();
        announce('已更新考試日。');
      }
    } else if (t.id === 'dailyGoal') {
      const n = Math.round(Number(t.value));
      if (n >= 5 && n <= 500) {
        settings().dailyGoal = n;
        Store.save();
        announce('已更新每日目標。');
      } else t.value = settings().dailyGoal;
    } else if (t.id === 'furigana') {
      setFurigana(t.checked);
    } else if (t.id === 'importFile' && t.files[0]) {
      importProgress(t.files[0]);
      t.value = '';
    } else if (t.id === 'mistakeCat') {
      mistakeFilter.cat = t.value;
      mistakeFilter.type = '';
      render({keepScroll: true, after: () => document.getElementById('mistakeCat')?.focus()});
    } else if (t.id === 'mistakeType') {
      mistakeFilter.type = t.value;
      render({keepScroll: true, after: () => document.getElementById('mistakeType')?.focus()});
    }
  });

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (status !== 'ok') return;
    const t = event.target;
    if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    // Let Enter/Space activate the focused control natively.
    if ((event.key === 'Enter' || event.key === ' ') && t.closest?.('button, a, summary, label')) return;
    const [page, args] = parts();
    if (A.keys[page]?.(event, args)) event.preventDefault();
  });

  window.addEventListener('hashchange', () => {
    render({top: true, after: () => document.querySelector('#app h1')?.focus({preventScroll: true})});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Speech.stop();
      A.mockPause?.();
    } else if (location.hash === '#mock/run') {
      render({keepScroll: true});
    }
  });
  window.addEventListener('pagehide', () => {
    Speech.stop();
    A.mockPause?.();
  });
  // Japanese voices load asynchronously; refresh a waiting player once known.
  Speech.whenReady(() => {
    if (document.querySelector('#player [data-action="audio-play"][disabled]')) render({keepScroll: true});
  });

  document.title = '臨時抱佛腳｜' + pack.title;
  document.getElementById('course').textContent = pack.label.replace('JLPT ', '');
  document.getElementById('footerTopic').textContent = pack.name + ' ' + pack.label;
  render();
})();
