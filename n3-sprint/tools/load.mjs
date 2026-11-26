// Loads the whole question bank (or selected data files) into a sandbox.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

export const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
export const dataFiles = () => fs.readdirSync(path.join(dist, 'data')).filter(f => f.endsWith('.js')).sort();

export function load(only) {
  const context = vm.createContext({});
  const fileOf = new Map();
  const run = rel => {
    const bank = context.Bank;
    const before = bank ? [bank.questions.length, bank.notes.length] : [0, 0];
    vm.runInContext(fs.readFileSync(path.join(dist, rel), 'utf8'), context, {filename: rel});
    const after = context.Bank;
    if (after) {
      after.questions.slice(before[0]).forEach(q => fileOf.set(q, rel));
      after.notes.slice(before[1]).forEach(n => fileOf.set(n, rel));
    }
  };
  run('bank.js');
  const failures = [];
  if (!only) {
    for (const legacy of ['knowledge.js', 'reading.js']) {
      const start = context.Bank.questions.length;
      run(legacy);
      vm.runInContext(`Bank.legacy(globalThis.${legacy.replace('.js', '')})`, context);
      context.Bank.questions.slice(start).forEach(q => fileOf.set(q, legacy));
    }
  }
  for (const file of only || dataFiles().map(f => 'data/' + f)) {
    try { run(file); } catch (error) { failures.push(file + ': ' + error.message); }
  }
  return {bank: context.Bank, fileOf, failures};
}
