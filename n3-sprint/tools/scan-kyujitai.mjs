#!/usr/bin/env node
// Flags traditional-Chinese character forms inside Japanese text (stems, options, passages, scripts, note examples).
import {load} from './load.mjs';
// keep only characters that are NOT valid Japanese shinjitai: derive by an explicit allow-list of real mismatches
const kyu = new Set('學體國來對會氣發說讀當經樂變點關實寫將藥圖顏驗聲應數歸萬與處舊單戰廣觀斷繼續殘據轉傳圍團權檢齒歲邊賣譯醫鐵廳靜顯驛黃壓榮營獨擔擇澤濟滿灣濕爭畫區參惡擴攝晝曉條樣樓歷淚燒狀產禮稱絲綠緣縣總聽臟臺莊藏覺譽豐賴輕鄉釋隨險雜難靈餘驅鹽麥齊龍壞寶寢屬從徑惠戀戲擧效歡沒溫爲犧獵獻眾禪稻穩粹繩纖聯肅膽蟲蠶覽觸證讓贊踐遞遲醉釀錄鑄陷隱雙霸騷驚髮雞這們還裡麼為絕腦舉號辭鄰錢內稅戶步歩每海悔梅敏繁勉晚免卷圈劍儉險驗檢權勸歡觀關顯濕溼顏產彥隆類淚賓頻黑默墨徵懲德聽廳應鷹穗惠專傳轉團處據劇獻犧戲虛號壽鑄禱燈證澄盜鹽鹼稱彌爾璽條滌縱從聳蔥總聰窗搖謠遙瑤醫毆歐鷗樞驅區樓數類寬臟藏莊裝壯狀將獎醬奬'.split(''));
['海','難','類','驚','悔','梅','歩','敏','繁','勉','免','彥','隆','徵','爾','璽','聳','蔥','瑤','醬','奬','溼','鹼','彌','禱','圈'].forEach(c => kyu.delete(c));
const {bank, fileOf} = load();
let n = 0;
const check = (item, field, textValue) => {
  const hits = [...new Set([...String(textValue || '')].filter(c => kyu.has(c)))];
  if (hits.length) { n++; console.log(`${fileOf.get(item)} ${item.id} ${field}: ${hits.join('')}`); }
};
for (const q of bank.questions) {
  check(q, 'prompt', q.prompt); check(q, 'passage', q.passage); check(q, 'options', q.options.join('|'));
  if (q.audio) check(q, 'audio', q.audio.scene + q.audio.question + q.audio.script.map(l => l[1]).join(''));
}
for (const note of bank.notes) {
  check(note, 'title', note.title); check(note, 'example', note.example);
  for (const i of note.items || []) check(note, 'item', i.word + i.example);
}
console.log(n ? n + ' hit(s)' : 'clean');
