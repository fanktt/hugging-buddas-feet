// Topic pack: everything exam-specific lives here so app.js stays generic.
// Data comes from the Bank registry (bank.js + data/*.js); the two legacy
// files are merged in before the app reads Bank.questions.
(() => {
  const Bank = globalThis.Bank;
  if (typeof globalThis.knowledge !== 'undefined') Bank.legacy(globalThis.knowledge);
  if (typeof globalThis.reading !== 'undefined') Bank.legacy(globalThis.reading);
  if (Bank.errors.length) console.warn('Bank registry problems:', Bank.errors);

  // Default exam day: the next first Sunday of July or December.
  function nextExamDate(from = new Date()) {
    const firstSunday = (year, month) => {
      const d = new Date(year, month, 1);
      d.setDate(1 + ((7 - d.getDay()) % 7));
      return d;
    };
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (let year = start.getFullYear(); year < start.getFullYear() + 2; year++) {
      for (const month of [6, 11]) {
        const day = firstSunday(year, month);
        if (day >= start) return day.toLocaleDateString('sv-SE');
      }
    }
    return '';
  }

  globalThis.topic = {
    id: 'jlpt-n3',
    label: 'JLPT N3',
    name: '日本語能力試驗',
    title: 'N3 考前衝刺室',
    art: 'fuji.png',
    language: 'ja',
    defaultExamDate: nextExamDate(),
    defaultDailyGoal: 40,
    sprintSize: 20,

    categories: [
      {id: 'vocab', name: '文字詞彙', shortName: '詞彙', english: 'Vocabulary', glyph: '字', color: 'brick',
        desc: '漢字讀音、表記、文脈選詞、近義與用法', weight: 6},
      {id: 'grammar', name: '文法', shortName: '文法', english: 'Grammar', glyph: '文', color: 'olive',
        desc: '句型接續、句子排列與文章文法', weight: 5},
      {id: 'reading', name: '讀解', shortName: '讀解', english: 'Reading', glyph: '読', color: 'blue',
        desc: '短文、中篇、長文與資訊檢索', weight: 4},
      {id: 'listening', name: '聽解', shortName: '聽解', english: 'Listening', glyph: '聴', color: 'plum',
        desc: '課題、重點、概要理解與發話、即時應答', weight: 5}
    ],

    // Display order of question types, with the official Japanese label.
    types: [
      {name: '漢字讀音', ja: '漢字読み', cat: 'vocab'},
      {name: '文字表記', ja: '表記', cat: 'vocab'},
      {name: '文脈選詞', ja: '文脈規定', cat: 'vocab'},
      {name: '近義改寫', ja: '言い換え類義', cat: 'vocab'},
      {name: '詞語用法', ja: '用法', cat: 'vocab'},
      {name: '文法形式', ja: '文の文法1', cat: 'grammar'},
      {name: '句子排列', ja: '文の文法2', cat: 'grammar'},
      {name: '文章文法', ja: '文章の文法', cat: 'grammar'},
      {name: '短文理解', ja: '内容理解（短文）', cat: 'reading'},
      {name: '中篇理解', ja: '内容理解（中文）', cat: 'reading'},
      {name: '長文理解', ja: '内容理解（長文）', cat: 'reading'},
      {name: '資訊檢索', ja: '情報検索', cat: 'reading'},
      {name: '課題理解', ja: '課題理解', cat: 'listening'},
      {name: 'ポイント理解', ja: 'ポイント理解', cat: 'listening'},
      {name: '概要理解', ja: '概要理解', cat: 'listening'},
      {name: '発話表現', ja: '発話表現', cat: 'listening'},
      {name: '即時応答', ja: '即時応答', cat: 'listening'}
    ],

    // Listening types that read the question before the dialogue as well.
    questionFirst: ['課題理解', 'ポイント理解'],

    mocks: {
      full: {
        name: '完整模考', english: 'Full mock', minutes: 140,
        desc: '依 N3 正式結構分三節計時，題數不足時盡量取。',
        sections: [
          {id: 'vocab', name: '言語知識（文字・語彙）', minutes: 30,
            items: [['漢字讀音', 8], ['文字表記', 6], ['文脈選詞', 11], ['近義改寫', 5], ['詞語用法', 5]]},
          {id: 'grammar', name: '言語知識（文法）・讀解', minutes: 70,
            items: [['文法形式', 13], ['句子排列', 5], ['文章文法', 5], ['短文理解', 4], ['中篇理解', 6], ['長文理解', 4], ['資訊檢索', 2]]},
          {id: 'listening', name: '聽解', minutes: 40,
            items: [['課題理解', 6], ['ポイント理解', 6], ['概要理解', 3], ['発話表現', 4], ['即時応答', 9]]}
        ]
      },
      mini: {
        name: '迷你模考', english: 'Mini mock', minutes: 25,
        desc: '約 25 分鐘，三節各題型按比例縮小，適合每天一回。',
        sections: [
          {id: 'vocab', name: '言語知識（文字・語彙）', minutes: 6,
            items: [['漢字讀音', 3], ['文字表記', 2], ['文脈選詞', 3], ['近義改寫', 2], ['詞語用法', 2]]},
          {id: 'grammar', name: '言語知識（文法）・讀解', minutes: 12,
            items: [['文法形式', 4], ['句子排列', 2], ['短文理解', 1], ['中篇理解', 3]]},
          {id: 'listening', name: '聽解', minutes: 7,
            items: [['課題理解', 2], ['ポイント理解', 2], ['概要理解', 1], ['発話表現', 1], ['即時応答', 3]]}
        ]
      }
    },
    passScore: {total: 95, section: 19, sectionMax: 60},

    questions: Bank.questions,
    notes: Bank.notes,
    resources: globalThis.resources || [],
    scope: '本題庫依 JLPT 公布的 N3 題型編寫：文字詞彙五類、文法三類、讀解四類、聽解五類。聽解由瀏覽器語音合成朗讀。官方未公布逐項詞表與文法表，本站提供原創練習與繁中解析。',
    sources: [
      ['官方 N3 題型說明', 'https://www.jlpt.jp/guideline/pdf/n3.pdf'],
      ['JLPT 常見問題', 'https://jlpt.jp/sp/e/faq/index.html']
    ]
  };
})();
