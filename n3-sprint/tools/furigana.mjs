#!/usr/bin/env node
// Furigana files live in dist/ruby/<source>.js and mirror the bank text with {漢字|かんじ} marks.
//   node tools/furigana.mjs template [source.js ...]   write missing ruby files with plain text to annotate
//   node tools/furigana.mjs check [ruby/file.js ...]    verify annotations against the bank
//   node tools/furigana.mjs readings                    list words annotated with more than one reading
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {load, dist} from './load.mjs';

const [command, ...args] = process.argv.slice(2);
const {bank, fileOf} = load();
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dist, 'bank.js'), 'utf8'), context);
const Ruby = context.Ruby;
const rubyDir = path.join(dist, 'ruby');
const rubyName = source => 'ruby/' + path.basename(source);
const kanji = /[㐀-鿿々]/;
const kana = /^[ぁ-ゖァ-ヺー]+$/;

// Every string that needs furigana, grouped by the key it is registered under.
function entries() {
  const out = new Map();
  const put = (key, source, fields, meta) => { if (!out.has(key)) out.set(key, {key, source, fields, meta}); };
  for (const q of bank.questions) {
    const source = fileOf.get(q);
    const fields = {};
    if (q.audio) {
      if (q.audio.scene) fields.sc = q.audio.scene;
      if (q.audio.question) fields.qn = q.audio.question;
      if (q.audio.script.length) fields.s = q.audio.script.map(l => l[1]);
    } else fields.p = bank.stem(q).stem;
    if (q.type !== '文字表記') fields.o = [...q.options];
    fields.x = q.explanation;
    if (q.passage && !q.passageId) fields.t = q.passage;
    put(q.id, source, fields, q);
    if (q.passageId) put('@' + q.passageId, source, {t: q.passage}, q);
  }
  for (const n of bank.notes) {
    const fields = {t: n.title};
    if (n.example) fields.e = n.example;
    if (n.items) fields.ie = n.items.map(i => i.example);
    put(n.id, fileOf.get(n), fields, n);
  }
  return out;
}
const all = entries();

if (command === 'template') {
  fs.mkdirSync(rubyDir, {recursive: true});
  const sources = [...new Set([...all.values()].map(e => e.source))].filter(s => !args.length || args.includes(s));
  for (const source of sources) {
    const target = path.join(dist, rubyName(source));
    if (fs.existsSync(target)) { console.log('exists, skipped: ' + rubyName(source)); continue; }
    const lines = [`// Furigana for ${source}. Kanji are written {漢字|かんじ}; everything else must match the source text.`];
    for (const e of all.values()) if (e.source === source) lines.push(`Ruby.add(${JSON.stringify(e.key)}, ${JSON.stringify(e.fields, null, 1)});`);
    fs.writeFileSync(target, lines.join('\n') + '\n');
    console.log('wrote ' + rubyName(source));
  }
} else if (command === 'check' || command === 'readings') {
  const files = fs.existsSync(rubyDir) ? fs.readdirSync(rubyDir).filter(f => f.endsWith('.js')).map(f => 'ruby/' + f) : [];
  const problems = [];
  const registeredIn = new Map();
  for (const file of files) {
    const before = new Set(Object.keys(Ruby.map));
    try { vm.runInContext(fs.readFileSync(path.join(dist, file), 'utf8'), context, {filename: file}); }
    catch (error) { problems.push(`${file}: ${error.message}`); }
    for (const key of Object.keys(Ruby.map)) if (!before.has(key)) registeredIn.set(key, file);
  }
  const wanted = file => !args.length || args.includes(file);
  const readings = new Map();
  const pattern = /\{([^{}|]+)\|([^{}|]+)\}/g;
  function checkText(where, plain, annotated, {japanese, type, field}) {
    if (typeof annotated !== 'string') return problems.push(`${where}: missing`);
    if (Ruby.strip(annotated) !== plain) {
      const stripped = Ruby.strip(annotated);
      let i = 0;
      while (i < plain.length && plain[i] === stripped[i]) i++;
      return problems.push(`${where}: text differs from source near 「${plain.slice(Math.max(0, i - 6), i + 10)}」 vs 「${stripped.slice(Math.max(0, i - 6), i + 10)}」`);
    }
    for (const [, base, reading] of annotated.matchAll(pattern)) {
      if (!kana.test(reading)) problems.push(`${where}: reading 「${reading}」 for 「${base}」 is not kana`);
      if (!kanji.test(base)) problems.push(`${where}: 「${base}」 has no kanji`);
      if (!readings.has(base)) readings.set(base, new Map());
      const seen = readings.get(base);
      if (!seen.has(reading)) seen.set(reading, []);
      seen.get(reading).push(where);
    }
    if (annotated.includes('{') && /\{[^{}|]*\}|\{[^{}]*\|[^{}]*\|/.test(annotated)) problems.push(`${where}: malformed mark`);
    if (!japanese) return;
    let bare = annotated.replace(pattern, '');
    if (type === '漢字讀音' && field === 'p') bare = bare.replace(/【[^】]*】/g, '');
    const left = bare.match(/[㐀-鿿々]+/g);
    if (left) problems.push(`${where}: kanji without furigana: ${[...new Set(left)].join(' ')}`);
  }
  for (const e of all.values()) {
    const file = rubyName(e.source);
    if (!wanted(file)) continue;
    const entry = Ruby.map[e.key];
    if (!entry) { if (files.includes(file)) problems.push(`${file} ${e.key}: entry missing`); continue; }
    for (const [field, plain] of Object.entries(e.fields)) {
      const japanese = field !== 'x';
      const where = `${file} ${e.key}.${field}`;
      if (Array.isArray(plain)) {
        if (!Array.isArray(entry[field]) || entry[field].length !== plain.length) { problems.push(`${where}: needs ${plain.length} items`); continue; }
        plain.forEach((text, i) => checkText(`${where}[${i}]`, text, entry[field][i], {japanese, type: e.meta.type, field}));
      } else checkText(where, plain, entry[field], {japanese, type: e.meta.type, field});
    }
  }
  for (const [key, file] of registeredIn) if (!all.has(key) && !key.startsWith('#') && wanted(file)) problems.push(`${file} ${key}: no such question, passage or note`);
  if (command === 'readings') {
    for (const [base, seen] of [...readings].sort()) {
      if (seen.size < 2) continue;
      console.log(base + '  ' + [...seen].map(([r, where]) => `${r}×${where.length} (${where.slice(0, 2).map(w => w.split(' ')[1]).join(', ')})`).join('  |  '));
    }
  } else {
    const missing = [...new Set([...all.values()].map(e => rubyName(e.source)))].filter(f => !files.includes(f));
    if (!args.length && missing.length) console.log('no furigana file yet: ' + missing.join(', '));
    for (const p of problems.slice(0, 200)) console.log('ERROR ' + p);
    if (problems.length > 200) console.log(`… and ${problems.length - 200} more`);
    console.log(problems.length ? `${problems.length} problem(s)` : 'OK');
    process.exit(problems.length ? 1 : 0);
  }
} else console.log('usage: furigana.mjs template|check|readings [files]');
