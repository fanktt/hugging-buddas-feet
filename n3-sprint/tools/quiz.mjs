#!/usr/bin/env node
// Blind check: export questions without answers, then grade an answer sheet.
//   node tools/quiz.mjs export data/file.js > /tmp/quiz.json
//   node tools/quiz.mjs grade data/file.js /tmp/answers.json   (answers: {"<id>": "A"|"B"|"C"|"D"})
// Flags: --no-passage (export without the text, to test guessability), --only=<regex on id>,
//        --quiet (grade prints the score only, counting just the answered questions)
import fs from 'node:fs';
import {load} from './load.mjs';

const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const [command, fileArg, sheet] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const only = flags.find(f => f.startsWith('--only='));
const onlyPattern = only ? new RegExp(only.slice(7)) : null;
const noPassage = flags.includes('--no-passage');
const quiet = flags.includes('--quiet');
const file = fileArg.replace(/^.*dist\//, '');
const {bank, fileOf} = load();
const mine = bank.questions.filter(q => fileOf.get(q) === file && (!onlyPattern || onlyPattern.test(q.id)));
function order(q) {
  let seed = 2166136261;
  for (const ch of q.id) seed = Math.imul(seed ^ ch.codePointAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = q.options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
const letter = i => 'ABCD'[i];
if (command === 'export') {
  console.log(JSON.stringify(mine.map(q => ({
    id: q.id, type: q.type,
    ...(q.passage && !noPassage ? {passage: q.passage} : {}),
    ...(q.audio ? {scene: q.audio.scene, script: q.audio.script.map(l => l.join('：'))} : {}),
    prompt: q.prompt,
    options: Object.fromEntries(order(q).map((o, i) => [letter(i), q.options[o]]))
  })), null, 1));
} else if (command === 'grade') {
  const answers = JSON.parse(fs.readFileSync(sheet, 'utf8'));
  let right = 0;
  const graded = quiet ? mine.filter(q => answers[q.id]) : mine;
  for (const q of graded) {
    const o = order(q);
    const correct = letter(o.indexOf(q.answer));
    const given = String(answers[q.id] || '').trim().toUpperCase();
    if (given === correct) right++;
    else if (!quiet) console.log(`MISMATCH ${q.id}: you ${given || '-'}=${q.options[o['ABCD'.indexOf(given)]] ?? '?'} | key ${correct}=${q.options[q.answer]}`);
  }
  console.log(`${right} / ${graded.length} match the key`);
} else {
  console.log('usage: quiz.mjs export|grade data/file.js [answers.json]');
}
