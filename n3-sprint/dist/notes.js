// 佛腳筆記: browse/search the notes and drill them as flashcards.
// Counts come from the index; a kind's note files are loaded before its pages draw.
(() => {
  const A = globalThis.App;
  const {Store, esc} = A;
  const KINDS = {
    grammar: {name: '文法句型', english: 'Grammar patterns'},
    confuse: {name: '易混淆詞', english: 'Look-alike words'}
  };
  // Index entries {id, kind}, in bank order; the full note comes from A.note(id).
  const ofKind = kind => A.notes.filter(n => n.kind === kind);
  const idsOf = kind => ofKind(kind).map(n => n.id);

  // Search text is built once per note, after its file has loaded.
  const haystack = new Map();
  function searchText(n) {
    if (!haystack.has(n.id)) {
      haystack.set(n.id, [
        n.title, n.connection, n.meaning, n.example, n.exampleZh, n.tip,
        ...(n.items || []).flatMap(i => [i.word, i.reading, i.meaning, i.example])
      ].filter(Boolean).join('\n').toLowerCase());
    }
    return haystack.get(n.id);
  }

  let query = '';
  const marks = () => Store.state.noteMarks;

  // ---------- rendering ----------
  // Furigana for a note: {t title, e example, ie item examples}.
  const note = n => (globalThis.Ruby ? globalThis.Ruby.get(n.id) : {}) || {};
  const title = n => A.ja(n.title, note(n).t);
  function grammarBody(n) {
    return `<dl class="noteFacts"><div><dt>接續</dt><dd lang="ja">${esc(n.connection)}</dd></div>` +
      `<div><dt>意思</dt><dd>${esc(n.meaning)}</dd></div></dl>` +
      `<p class="example" lang="ja">${A.ja(n.example, note(n).e)}</p><p class="exampleZh">${esc(n.exampleZh)}</p>` +
      (n.tip ? `<p class="tip"><span>易錯</span>${esc(n.tip)}</p>` : '');
  }
  function confuseBody(n) {
    return '<div class="confuseItems">' + n.items.map((i, k) =>
      `<div class="confuseItem"><p class="word" lang="ja">${esc(i.word)}${i.reading ? `<small>${esc(i.reading)}</small>` : ''}</p>` +
      `<p class="meaning">${esc(i.meaning)}</p><p class="example" lang="ja">${A.ja(i.example, note(n).ie?.[k])}</p></div>`).join('') + '</div>' +
      (n.tip ? `<p class="tip"><span>辨析</span>${esc(n.tip)}</p>` : '');
  }
  const noteBody = n => (n.kind === 'grammar' ? grammarBody(n) : confuseBody(n));

  function noteCard(n) {
    const m = marks()[n.id];
    const badge = m ? (m.known ? '<span class="badge ok">熟了</span>' : '<span class="badge">還不熟</span>') : '';
    return `<article class="note"><header><h3 lang="ja">${title(n)}</h3>${badge}</header>${noteBody(n)}</article>`;
  }

  function listHtml(kind) {
    const q = query.trim().toLowerCase();
    const list = ofKind(kind).map(n => A.note(n.id)).filter(n => n && (!q || searchText(n).includes(q)));
    if (!list.length) {
      return `<div class="panel empty"><p class="sub">${ofKind(kind).length ? '找不到符合的筆記。' : '筆記準備中，稍後再來看看。'}</p></div>`;
    }
    return `<p class="hint" aria-live="polite">共 ${list.length} 則</p><div class="noteGrid">${list.map(noteCard).join('')}</div>`;
  }

  function tabs(kind, base) {
    return '<nav class="tabs" aria-label="筆記分類">' + Object.entries(KINDS).map(([k, v]) =>
      `<a href="#${base}/${k}"${k === kind ? ' aria-current="page"' : ''}>${esc(v.name)}<small>${ofKind(k).length}</small></a>`).join('') + '</nav>';
  }

  function notesView([kind]) {
    kind = KINDS[kind] ? kind : 'grammar';
    const known = ofKind(kind).filter(n => marks()[n.id]?.known).length;
    return A.pageHead('佛腳筆記', 'Cram notes', '考前最後翻一遍：N3 常考句型與容易搞混的詞。') +
      tabs(kind, 'notes') +
      '<div class="noteTools">' +
      `<label class="search"><span class="visually-hidden">搜尋筆記</span>` +
      `<input type="search" id="noteSearch" placeholder="搜尋句型、意思或例句…" value="${esc(query)}" autocomplete="off"></label>` +
      (ofKind(kind).length
        ? `<a class="primary" href="#flash/${kind}">閃卡模式<small>已熟 ${known} / ${ofKind(kind).length}</small></a>` : '') +
      A.rubyToggleHtml() +
      '</div>' +
      `<div id="noteList">${listHtml(kind)}</div>`;
  }

  // ---------- flashcards ----------
  let deck = null;  // {kind, queue, flipped, knownNow, total}

  function buildDeck(kind) {
    const all = ofKind(kind);
    const m = marks();
    const unsure = A.shuffle(all.filter(n => m[n.id] && !m[n.id].known));
    const unseen = A.shuffle(all.filter(n => !m[n.id]));
    const known = A.shuffle(all.filter(n => m[n.id]?.known));
    return {kind, queue: [...unsure, ...unseen, ...known].map(n => n.id), flipped: false, knownNow: 0, total: all.length};
  }

  function flashView([kind]) {
    kind = KINDS[kind] ? kind : 'grammar';
    if (!deck || deck.kind !== kind) deck = buildDeck(kind);
    const head = A.pageHead(`閃卡：${KINDS[kind].name}`, 'Flashcards', '先回想意思，再翻面確認；還不熟的會很快再出現。') + tabs(kind, 'flash');
    if (!deck.total) return head + '<div class="panel empty"><p class="sub">筆記準備中，稍後再來看看。</p></div>';
    if (!deck.queue.length) {
      return head + `<div class="panel empty"><h2>這一輪全部熟了</h2><p class="sub">本輪標記熟了 ${deck.knownNow} 張。</p>` +
        `<div class="actions center"><button type="button" class="primary" data-action="flash-restart">再洗一次牌</button>` +
        `<a class="secondary" href="#notes/${kind}">回筆記列表</a></div></div>`;
    }
    const n = A.note(deck.queue[0]);
    const front = `<p class="cardKind">${esc(KINDS[kind].name)}</p><h2 class="flashTitle" lang="ja">${title(n)}</h2>`;
    return head +
      `<div class="flashMeta"><span>剩 ${deck.queue.length} 張</span><span>本輪已熟 ${deck.knownNow}</span>` +
      A.rubyToggleHtml() + `<a href="#notes/${kind}">結束，回列表</a></div>` +
      `<section class="flash${deck.flipped ? ' flipped' : ''}" aria-live="polite">${front}` +
      (deck.flipped
        ? `<div class="flashBack">${noteBody(n)}</div>` +
          '<div class="actions center"><button type="button" class="secondary" data-action="flash-rate" data-known="0" id="flashFirst">還不熟<span class="kbd" aria-hidden="true">1</span></button>' +
          '<button type="button" class="primary" data-action="flash-rate" data-known="1">熟了<span class="kbd" aria-hidden="true">2</span></button></div>'
        : '<div class="actions center"><button type="button" class="primary" data-action="flash-flip" id="flashFirst">翻面看答案<span class="kbd" aria-hidden="true">Space</span></button></div>') +
      '</section>';
  }

  function flip() {
    if (!deck || deck.flipped || !deck.queue.length) return;
    deck.flipped = true;
    A.render({keepScroll: true, after: () => document.getElementById('flashFirst')?.focus({preventScroll: true})});
  }
  function rate(known) {
    if (!deck || !deck.flipped) return;
    const id = deck.queue.shift();
    const m = marks()[id] || {seen: 0};
    marks()[id] = {known, seen: (m.seen || 0) + 1};
    if (known) deck.knownNow++;
    else deck.queue.splice(Math.min(3, deck.queue.length), 0, id);
    deck.flipped = false;
    Store.save();
    A.render({keepScroll: true, after: () => document.getElementById('flashFirst')?.focus({preventScroll: true})});
  }

  Object.assign(A.actions, {
    'flash-flip': flip,
    'flash-rate': el => rate(el.dataset.known === '1'),
    'flash-restart': () => { deck = null; A.render(); }
  });

  A.routes.notes = notesView;
  const needs = ([kind]) => idsOf(KINDS[kind] ? kind : 'grammar');
  A.needs.notes = needs;
  A.needs.flash = needs;
  A.routes.flash = args => {
    if (deck && deck.kind !== args[0]) deck = null;
    return flashView(args);
  };
  A.keys.flash = event => {
    if (event.key === ' ' || event.key === 'Enter') { if (!deck?.flipped) { flip(); return true; } return false; }
    if (event.key === '1') { rate(false); return true; }
    if (event.key === '2') { rate(true); return true; }
    return false;
  };

  // Live search updates only the list so the input keeps focus.
  document.addEventListener('input', event => {
    if (event.target.id !== 'noteSearch') return;
    query = event.target.value;
    const kind = location.hash.split('/')[1];
    const list = document.getElementById('noteList');
    if (list && A.loaded(idsOf(KINDS[kind] ? kind : 'grammar'))) list.innerHTML = listHtml(KINDS[kind] ? kind : 'grammar');
  });
  // Leaving the flashcard page resets the deck next time.
  A.flashReset = () => { deck = null; };
})();
