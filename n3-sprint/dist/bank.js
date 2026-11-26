// Question bank registry. Data files under data/ call Bank.group / Bank.passage /
// Bank.listen / Bank.addNotes. The correct answer is always written first; the app
// shuffles options when it builds a session. Data files are loaded on demand
// (Bank.ensure); manifest.js lists what each file contains so the app can count
// and select questions before any text is loaded.
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
  const questionById = new Map();
  const noteById = new Map();
  const pad = n => String(n).padStart(2, '0');
  function info(type, where) {
    if (!TYPES[type]) errors.push(where + ': unknown type ' + type);
    return TYPES[type] || {cat: 'vocab'};
  }
  // A file that somehow runs twice must not register its items twice.
  function addQuestion(q) {
    if (questionById.has(q.id)) return;
    questionById.set(q.id, q);
    questions.push(q);
  }
  function addNote(n) {
    if (noteById.has(n.id)) return;
    noteById.set(n.id, n);
    notes.push(n);
  }

  // rows: [stem, correct, d1, d2, d3, explanation]
  function group(prefix, type, rows) {
    const t = info(type, prefix);
    rows.forEach((row, i) => {
      const [stem, correct, d1, d2, d3, explanation] = row;
      addQuestion({
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
      addQuestion({
        id: id + '-' + (i + 1), cat: t.cat, type, prompt,
        passageId: id, passage: text.trim(),
        options: [correct, d1, d2, d3], answer: 0, explanation
      });
    });
  }

  // audio: {scene?, script: [[speaker, line], ...], question?}; speaker is 'M', 'F', 'M2', 'F2' or 'N'.
  function listen(id, type, audio, options, explanation) {
    const t = info(type, id);
    addQuestion({
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
        addNote({id, kind, title: pattern, connection, meaning, example, exampleZh, tip: tip || ''});
      } else if (kind === 'confuse') {
        const [title, items, tip] = row;
        addNote({
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
      addQuestion(item);
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

  // ---------- catalog (manifest.js) ----------
  // manifest.js is generated by tools/manifest.mjs and describes every data file without its
  // text: [file, rubyFile, [[type, ...items]], [[kind, ...items]]]. Items:
  //   'base*n'  → base-01 … base-n (Bank.group, addNotes, numbered Bank.listen)
  //   '@pid*n'  → pid-1 … pid-n sharing passage pid (Bank.passage); '@pid' means one question
  //   anything else → a single id
  const catalog = {files: [], questions: [], notes: []};
  const fileOfId = new Map();
  const rubyOf = new Map();
  function expand(item, each) {
    const passage = item[0] === '@';
    const body = passage ? item.slice(1) : item;
    const star = body.lastIndexOf('*');
    const base = star < 0 ? body : body.slice(0, star);
    const n = star < 0 ? 1 : Number(body.slice(star + 1));
    if (passage) for (let i = 1; i <= n; i++) each(base + '-' + i, base);
    else if (star < 0) each(base);
    else for (let i = 1; i <= n; i++) each(base + '-' + pad(i));
  }
  function manifest(list) {
    for (const [file, ruby, questionRuns = [], noteRuns = []] of list) {
      const entry = {file, ruby: ruby || '', questions: [], notes: []};
      if (ruby) rubyOf.set(file, ruby);
      for (const [type, ...items] of questionRuns) {
        const cat = (TYPES[type] || {cat: 'vocab'}).cat;
        for (const item of items) {
          expand(item, (id, passageId) => {
            if (fileOfId.has(id)) return;
            const q = passageId ? {id, cat, type, passageId, file} : {id, cat, type, file};
            fileOfId.set(id, file);
            entry.questions.push(q);
            catalog.questions.push(q);
          });
        }
      }
      for (const [kind, ...items] of noteRuns) {
        for (const item of items) {
          expand(item, id => {
            if (fileOfId.has(id)) return;
            const n = {id, kind, file};
            fileOfId.set(id, file);
            entry.notes.push(n);
            catalog.notes.push(n);
          });
        }
      }
      catalog.files.push(entry);
    }
  }

  // ---------- on-demand loading ----------
  // Data and furigana files are added as <script> elements (works from file:// too).
  // Each file loads once; a failed file can be requested again.
  const loaded = new Set();
  const inflight = new Map();
  const rubyFailed = new Set();
  let reported = 0;
  function inject(file) {
    if (loaded.has(file)) return Promise.resolve();
    if (inflight.has(file)) return inflight.get(file);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = file;
      script.async = true;
      script.onload = () => {
        inflight.delete(file);
        loaded.add(file);
        if (errors.length > reported) {
          console.warn('Bank registry problems:', errors.slice(reported));
          reported = errors.length;
        }
        resolve();
      };
      script.onerror = () => {
        inflight.delete(file);
        script.remove();
        const error = new Error('Could not load ' + file);
        error.files = [file];
        reject(error);
      };
      document.head.appendChild(script);
    });
    inflight.set(file, promise);
    return promise;
  }
  // items: question ids, note ids or file paths ('data/x.js'). Unknown ids are ignored.
  function filesFor(items) {
    const files = new Set();
    for (const item of items || []) {
      if (/\.js$/.test(item)) files.add(item);
      else if (fileOfId.has(item)) files.add(fileOfId.get(item));
    }
    return [...files];
  }
  const rubyFiles = files => files.map(f => rubyOf.get(f)).filter(Boolean);
  function ready(items, {ruby = false} = {}) {
    const files = filesFor(items);
    return files.every(f => loaded.has(f)) &&
      (!ruby || rubyFiles(files).every(r => loaded.has(r) || rubyFailed.has(r)));
  }
  // Resolves when every needed data file has run. Furigana is optional: a furigana file
  // that fails is remembered (text falls back to plain) until retryRuby() is called.
  function ensure(items, {ruby = false} = {}) {
    const files = filesFor(items);
    const extras = ruby
      ? rubyFiles(files).filter(r => !rubyFailed.has(r)).map(r => inject(r).catch(error => {
        rubyFailed.add(r);
        console.warn(error.message);
      }))
      : [];
    return Promise.allSettled(files.map(inject)).then(results => Promise.all(extras).then(() => {
      const failed = files.filter((f, i) => results[i].status === 'rejected');
      if (failed.length) {
        const error = new Error('Could not load ' + failed.join(', '));
        error.files = failed;
        throw error;
      }
    }));
  }

  return {
    TYPES, questions, notes, errors, group, passage, listen, addNotes, legacy, stem,
    manifest, catalog, ensure, ready, filesFor,
    question: id => questionById.get(id),
    note: id => noteById.get(id),
    isLoaded: file => loaded.has(file),
    loadedFiles: () => [...loaded],
    retryRuby: () => rubyFailed.clear()
  };
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
