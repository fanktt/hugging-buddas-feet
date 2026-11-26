// Replace this topic pack to reuse the practice flow for another exam.
globalThis.topic = {
  id: 'jlpt-n3', label: 'JLPT N3', name: '日本語能力試驗', title: 'N3 考前衝刺室',
  intro: '集中火力練習文字詞彙、文法與讀解。', art: 'fuji.png',
  language: 'ja', round: 20, dailyGoal: 40,
  categories: [
    {id:'vocab', name:'文字詞彙', shortName:'詞彙', english:'Vocabulary', glyph:'字', color:'brick', desc:'漢字讀音、語境選詞與近義辨析', quota:8},
    {id:'grammar', name:'文法練習', shortName:'文法', english:'Grammar', glyph:'文', color:'olive', desc:'句型接續、語句排列與文章文法', quota:7},
    {id:'reading', name:'閱讀理解', shortName:'讀解', english:'Reading', glyph:'読', color:'blue', desc:'掌握段落主旨，快速定位關鍵資訊', quota:5}
  ],
  questions: [...knowledge,...reading], resources,
  scope:'本題庫依 JLPT 公布的 N3 筆試題型編寫。文字詞彙涵蓋五類題型，文法涵蓋三類題型，讀解涵蓋短文、中篇、長篇與資訊檢索。官方未公布逐項詞表與文法表，本站提供原創練習與繁中解析。',
  sources:[['官方 N3 題型說明','https://www.jlpt.jp/guideline/pdf/n3.pdf'],['JLPT 常見問題','https://jlpt.jp/sp/e/faq/index.html']]
};
