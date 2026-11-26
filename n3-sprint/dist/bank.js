// Question bank registry. Data files under data/ call Bank.group / Bank.passage /
// Bank.listen / Bank.notes. The correct answer is always written first; the app
// shuffles options when it builds a session.
globalThis.Bank = (() => {
  const TYPES = {
    '漢字讀音': {cat: 'vocab', instruction: '【　】の言葉はどう読みますか。'},
    '文字表記': {cat: 'vocab', instruction: '【　】の言葉を漢字で書くとどうなりますか。'},
    '文脈選詞': {cat: 'vocab', instruction: '（　）に入る言葉を選んでください。'},
    '近義改寫': {cat: 'vocab', instruction: '【　】に最も近い意味を選んでください。'},
    '詞語用法': {cat: 'vocab', instruction: '次の言葉の使い方として最もよい文を選んでください。'},
    '文法形式': {cat: 'grammar', instruction: '（　）に入る最もよいものを選んでください。'},
    '句子排列': {cat: 'grammar', instruction: '四つの部分を並べたとき、★に入るものを選んでください。'},
    '文章文法': {cat: 'grammar'},
    '短文理解': {cat: 'reading'},
    '中篇理解': {cat: 'reading'},
    '長文理解': {cat: 'reading'},
    '資訊檢索': {cat: 'reading'},
    '課題理解': {cat: 'listening', options: 4},
    'ポイント理解': {cat: 'listening', options: 4},
    '概要理解': {cat: 'listening', options: 4},
    '発話表現': {cat: 'listening', options: 3, spokenOptions: true, showScene: true},
    '即時応答': {cat: 'listening', options: 3, spokenOptions: true}
  };
  const questions = [];
  const notes = [];
  const errors = [];
  const pad = n => String(n).padStart(2, '0');
  function info(type, where) {
    if (!TYPES[type]) errors.push(where + ': unknown type ' + type);
    return TYPES[type] || {cat: 'vocab'};
  }

  // rows: [stem, correct, d1, d2, d3, explanation]
  function group(prefix, type, rows) {
    const t = info(type, prefix);
    rows.forEach((row, i) => {
      const [stem, correct, d1, d2, d3, explanation] = row;
      questions.push({
        id: prefix + '-' + pad(i + 1), cat: t.cat, type,
        prompt: (t.instruction ? t.instruction + '\n' : '') + stem,
        options: [correct, d1, d2, d3], answer: 0, explanation
      });
    });
  }

  // rows: [prompt, correct, d1, d2, d3, explanation]; all rows share one text.
  function passage(id, type, text, rows) {
    const t = info(type, id);
    rows.forEach((row, i) => {
      const [prompt, correct, d1, d2, d3, explanation] = row;
      questions.push({
        id: id + '-' + (i + 1), cat: t.cat, type, prompt,
        passageId: id, passage: text.trim(),
        options: [correct, d1, d2, d3], answer: 0, explanation
      });
    });
  }

  // audio: {scene?, script: [[speaker, line], ...], question?}; speaker is 'M', 'F', 'M2', 'F2' or 'N'.
  function listen(id, type, audio, options, explanation) {
    const t = info(type, id);
    questions.push({
      id, cat: t.cat, type, prompt: audio.question || '',
      audio: {
        scene: audio.scene || '', script: audio.script || [], question: audio.question || '',
        spokenOptions: Boolean(t.spokenOptions), showScene: Boolean(t.showScene)
      },
      options: [...options], answer: 0, explanation
    });
  }

  // kind 'grammar': [pattern, connection, meaning, example, exampleZh, tip?]
  // kind 'confuse': [title, [[word, reading, meaning, example], ...], tip]
  function addNotes(prefix, kind, rows) {
    rows.forEach((row, i) => {
      const id = prefix + '-' + pad(i + 1);
      if (kind === 'grammar') {
        const [pattern, connection, meaning, example, exampleZh, tip] = row;
        notes.push({id, kind, title: pattern, connection, meaning, example, exampleZh, tip: tip || ''});
      } else if (kind === 'confuse') {
        const [title, items, tip] = row;
        notes.push({
          id, kind, title, tip: tip || '',
          items: items.map(([word, reading, meaning, example]) => ({word, reading, meaning, example}))
        });
      } else errors.push(prefix + ': unknown note kind ' + kind);
    });
  }

  // Questions written before the registry existed carry their own answer index.
  function legacy(list) {
    for (const q of list || []) {
      const item = {...q};
      if (item.cat === 'reading') item.passageId = item.id.replace(/-\d+$/, '');
      questions.push(item);
    }
  }

  // The part of the prompt shown as the question itself (without the shared instruction line).
  function stem(q) {
    const text = String(q.prompt || '');
    if (q.cat === 'reading' || q.cat === 'listening') return {instruction: '', stem: text};
    const cut = text.indexOf('\n');
    if (cut < 0) return {instruction: '', stem: text};
    const rest = text.slice(cut + 1);
    if (!rest.trim()) return {instruction: '', stem: text.slice(0, cut)};
    return {instruction: text.slice(0, cut), stem: rest};
  }

  return {TYPES, questions, notes, errors, group, passage, listen, addNotes, legacy, stem};
})();

// Furigana. Files under ruby/ register readings as copies of the original text in which
// kanji are written {漢字|かんじ}. Keys: question id, '@' + passageId, note id, '#' + type.
// Fields: p stem, o options, x explanation, t passage or note title, sc scene, qn question,
// s script lines, e example, ie item examples.
globalThis.Ruby = (() => {
  const map = {};
  const pattern = /\{([^{}|]+)\|([^{}|]+)\}/g;
  const strip = text => String(text).replace(pattern, '$1');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  // Returns safe HTML. Falls back to the plain text when no matching annotation exists.
  function html(plain, annotated, {on = true} = {}) {
    const text = String(plain ?? '');
    if (!on || typeof annotated !== 'string' || strip(annotated) !== text) return escape(text);
    return escape(annotated).replace(pattern, '<ruby>$1<rt>$2</rt></ruby>');
  }
  return {map, strip, html, add(id, entry) { map[id] = entry; }, get: id => map[id] || {}};
})();
