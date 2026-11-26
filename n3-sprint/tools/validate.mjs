#!/usr/bin/env node
// Usage: node tools/validate.mjs [data/file.js ...]
// Without arguments checks the whole bank, including cross-file duplicates.
import fs from 'node:fs';
import path from 'node:path';
import {load, dist, dataFiles} from './load.mjs';

const args = process.argv.slice(2).map(a => a.replace(/^.*dist\//, ''));
const {bank, fileOf, failures} = load();
const problems = [...failures, ...bank.errors];
const warnings = [];
const wanted = item => !args.length || args.includes(fileOf.get(item));
const say = (item, text) => { if (wanted(item)) problems.push(`${fileOf.get(item)} ${item.id}: ${text}`); };
const warn = (item, text) => { if (wanted(item)) warnings.push(`${fileOf.get(item)} ${item.id}: ${text}`); };
const text = v => typeof v === 'string' && v.trim().length > 0;
const speakers = new Set(['M', 'F', 'M2', 'F2', 'N']);
const target = q => (q.prompt.match(/【(.+?)】/g) || []).pop();

const ids = new Map();
const stems = new Map();
const targets = new Map();
for (const q of bank.questions) {
  const t = bank.TYPES[q.type];
  if (ids.has(q.id)) say(q, 'duplicate id (also in ' + fileOf.get(ids.get(q.id)) + ')');
  ids.set(q.id, q);
  if (!t) { say(q, 'unknown type ' + q.type); continue; }
  const count = t.options || 4;
  if (!Array.isArray(q.options) || q.options.length !== count) say(q, `needs ${count} options`);
  else {
    if (!q.options.every(text)) say(q, 'empty option');
    if (new Set(q.options.map(o => String(o).trim())).size !== q.options.length) say(q, 'duplicate options');
  }
  if (!(q.answer >= 0 && q.answer < (q.options || []).length)) say(q, 'answer index out of range');
  if (!text(q.explanation)) say(q, 'missing explanation');
  else if (q.explanation.length < 12) warn(q, 'explanation is very short');
  if (/第[一二三四]個?選?項(?!工作|是量)|選項\s*[A-DＡ-Ｄ1-4１-４]|[A-DＡ-Ｄ]\s*選項/.test(q.explanation || '')) say(q, 'explanation refers to an option by position, but options are shuffled');
  if (t.cat === 'listening') {
    const a = q.audio || {};
    if (!Array.isArray(a.script) || !a.script.every(l => Array.isArray(l) && speakers.has(l[0]) && text(l[1]))) say(q, 'bad script lines');
    if (q.type === '発話表現' ? !text(a.scene) : !a.script?.length) say(q, 'missing audio content');
    if (['課題理解', 'ポイント理解', '概要理解'].includes(q.type) && !text(a.question)) say(q, 'missing question');
  } else {
    if (!text(q.prompt)) say(q, 'missing prompt');
    if (t.cat === 'reading' && !text(q.passage)) say(q, 'missing passage');
    if (q.type === '句子排列' && (q.prompt.match(/★/g) || []).length !== 2) say(q, 'stem needs exactly one ★');
    if (q.type === '句子排列' && (q.prompt.split('\n').pop().match(/＿＿|★/g) || []).length !== 4) say(q, 'stem needs three ＿＿ and one ★');
    if (['漢字讀音', '文字表記', '近義改寫'].includes(q.type) && !target(q)?.replace(/[【】　\s]/g, '')) say(q, 'stem needs a 【target】');
    if (['文脈選詞', '文法形式'].includes(q.type) && !q.prompt.split('\n').pop().includes('（　）')) say(q, 'stem needs （　）');
  }
  const key = q.type + '|' + (q.passageId || q.passage || '') + '|' + q.prompt + '|' + (q.audio ? JSON.stringify(q.audio.script) + q.audio.scene : '');
  if (stems.has(key)) say(q, 'same stem as ' + stems.get(key).id);
  stems.set(key, q);
  if (['漢字讀音', '文字表記'].includes(q.type) || q.type === '詞語用法') {
    const word = q.type === '詞語用法' ? q.prompt.split('\n').pop().trim() : q.options[q.answer];
    const k = q.type + '|' + word;
    if (targets.has(k)) say(q, `target 「${word}」 already used by ${targets.get(k).id} (${fileOf.get(targets.get(k))})`);
    targets.set(k, q);
  }
}
const noteIds = new Set();
const titles = new Map();
for (const n of bank.notes) {
  if (noteIds.has(n.id)) say(n, 'duplicate note id');
  noteIds.add(n.id);
  if (!text(n.title)) say(n, 'missing title');
  if (titles.has(n.kind + n.title)) say(n, 'same title as ' + titles.get(n.kind + n.title).id);
  titles.set(n.kind + n.title, n);
  if (n.kind === 'grammar' && ![n.connection, n.meaning, n.example, n.exampleZh].every(text)) say(n, 'incomplete grammar note');
  if (n.kind === 'confuse' && !(n.items?.length >= 2 && n.items.every(i => text(i.word) && text(i.meaning) && text(i.example)))) say(n, 'incomplete confuse note');
}
if (!args.length) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  for (const f of dataFiles()) if (!html.includes('data/' + f)) problems.push('index.html does not load data/' + f);
}
const tally = {};
for (const q of bank.questions) if (wanted(q)) tally[q.cat + '/' + q.type] = (tally[q.cat + '/' + q.type] || 0) + 1;
console.log(tally);
console.log('questions:', bank.questions.filter(wanted).length, 'notes:', bank.notes.filter(wanted).length);
for (const w of warnings) console.log('warn  ' + w);
for (const p of problems) console.log('ERROR ' + p);
console.log(problems.length ? `${problems.length} problem(s)` : 'OK');
process.exit(problems.length ? 1 : 0);
