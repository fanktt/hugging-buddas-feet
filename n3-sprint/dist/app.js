(() => {
  const pack = globalThis.topic;
  const bank = new Map(pack.questions.map(q => [q.id,q]));
  const app = document.querySelector('#app');
  const key = 'study-sprint.v1.' + pack.id;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const category = id => pack.categories.find(cat => cat.id === id);
  const name = mode => category(mode)?.name || (mode === 'mistakes' ? '錯題重練' : '混合衝刺');
  let state = {records:{}, sessions:{},days:{}};
  let storageUnavailable = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.records && saved?.sessions && saved?.days) state = saved;
  } catch { storageUnavailable = true; }
  function save() {
    try { localStorage.setItem(key,JSON.stringify(state)); }
    catch { storageUnavailable = true; }
  }
  function today() { return new Date().toLocaleDateString('sv-SE'); }
  function mistakes() { return pack.questions.filter(q=>state.records[q.id]?.wrong); }
  function shuffle(items) {
    const result = [...items];
    for(let i=result.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [result[i],result[j]]=[result[j],result[i]];
    }
    return result;
  }
  function prioritize(pool) {
    return shuffle(pool).sort((a,b)=>(state.records[a.id]?.count||0)-(state.records[b.id]?.count||0));
  }
  function start(mode) {
    if (!state.sessions[mode] || state.sessions[mode].done) {
      let pool;
      if (mode === 'mixed') {
        pool=shuffle(pack.categories.flatMap(cat=>prioritize(pack.questions.filter(q=>q.cat===cat.id)).slice(0,cat.quota)));
      } else {
        pool=prioritize(mode==='mistakes'?mistakes():pack.questions.filter(q=>q.cat===mode)).slice(0,pack.round);
      }
      if (!pool.length) { location.hash='mistakes'; render(); return; }
      state.sessions[mode]={ids:pool.map(q=>q.id),answers:[],index:0,done:false};
      save();
    }
    const hash='#practice/'+mode;
    if (location.hash===hash) render();
    else location.hash=hash;
  }
  function startButton(mode,label) {
    return '<button class="primary" data-start="'+mode+'"><span class="play" aria-hidden="true">▶</span>'+label+'</button>';
  }
  function title(zh,en,tail='') {
    return '<div class="sectionTitle"><h2>'+zh+'</h2><span class="english">'+en+'</span><span class="tail">'+tail+'</span></div>';
  }
  function sectionHead(zh,en,desc) {
    return '<div class="pageHead"><span class="eyebrow">'+en+'</span><h1>'+zh+'</h1><p>'+desc+'</p></div>';
  }
  function total(records,field) {return records.reduce((n,r)=>n+r[field],0);}
  function home() {
    const records=Object.values(state.records);
    const count=total(records,'count');
    const day=state.days[today()]||0;
    const resume=state.sessions.mixed && !state.sessions.mixed.done;
    return '<section class="hero"><img class="heroArt" src="'+pack.art+'" alt=""><div class="heroCopy"><span class="eyebrow">'+escape(pack.label)+' · 集中特訓</span><h1>'+escape(pack.title)+'</h1><p>'+escape(pack.intro)+'<br>每回 '+pack.round+' 題，答完即看解析。</p><div class="heroActions">'+startButton('mixed',resume?'繼續混合衝刺':'開始混合衝刺')+'<small>'+pack.categories.map(c=>c.shortName+' '+c.quota).join('・')+'</small></div></div></section>'+
      title('分科特訓','Practice sets','共 '+bank.size+' 題')+
      '<div class="cards">'+pack.categories.map(cat=>{
        const active=state.sessions[cat.id]&&!state.sessions[cat.id].done;
        return '<button data-start="'+cat.id+'" class="card '+cat.color+'"><div class="cardHead"><span class="glyph" aria-hidden="true">'+cat.glyph+'</span><div><span class="english">'+cat.english+'</span><h3>'+cat.name+'</h3></div></div><p>'+cat.desc+'</p><div class="cardFoot"><span>'+pack.questions.filter(q=>q.cat===cat.id).length+' 道練習題</span><b>'+(active?'繼續練習':'開始練習')+'</b></div></button>';
      }).join('')+'</div>'+title('練習紀錄','Study record')+
      '<section class="stats"><div class="metric"><label>今日刷題目標</label><strong>'+day+' <small>/ '+pack.dailyGoal+' 題</small></strong><div class="track"><i style="width:'+Math.min(100,day/pack.dailyGoal*100)+'%"></i></div></div><div class="metric"><label>累計作答</label><strong>'+count+' <small>題</small></strong></div><div class="metric"><label>整體正確率</label><strong>'+(count?Math.round(total(records,'correct')/count*100)+'<small> %</small>':'—')+'</strong></div><div class="metric"><label><a href="#mistakes">待複習錯題</a></label><strong>'+mistakes().length+' <small>題</small></strong></div></section>';
  }
  function mistakePage() {
    const items=mistakes();
    const active=state.sessions.mistakes&&!state.sessions.mistakes.done;
    return sectionHead('錯題本','Review notebook','答錯的題目會收在這裡，再次答對就能移出。')+
      (active||items.length?startButton('mistakes',active?'繼續錯題重練':'重練錯題（'+Math.min(items.length,pack.round)+' 題）'):'')+
      (items.length?items.map(q=>'<article class="entry"><span class="tag">'+escape(q.type)+'</span><p class="reviewPrompt" lang="'+pack.language+'">'+escape(q.prompt)+'</p><details><summary>查看題目與解析</summary>'+(q.passage?'<p class="passage" lang="'+pack.language+'">'+escape(q.passage)+'</p>':'')+'<p>正解　'+escape(q.options[q.answer])+'</p><p>'+escape(q.explanation)+'</p></details></article>').join(''):'<div class="panel empty"><h2>目前沒有待複習的錯題</h2><p class="sub">完成練習後，可以在這裡回顧答錯的題目。</p>'+startButton('mixed','進入混合衝刺')+'</div>');
  }
  function resourcesPage() {
    return sectionHead('備考資源','Study resources',pack.name+'・'+pack.label)+
      '<section class="panel"><h2>練習範圍</h2><p>'+escape(pack.scope)+'</p>'+pack.sources.map(([s,u])=>'<a href="'+u+'" target="_blank" rel="noopener">'+s+'</a>').join('　')+'</section><div class="resources">'+
      pack.resources.map(r=>'<article class="entry"><span class="source">'+escape(r.source)+'</span><h2><a href="'+escape(r.url)+'" target="_blank" rel="noopener">'+escape(r.title)+'</a></h2><p>'+escape(r.description)+'</p></article>').join('')+'</div>';
  }
  function practice(mode,s) {
    const correct=s.answers.filter((a,i)=>bank.get(s.ids[i]).answer===a).length;
    if(s.done) return '<div class="practice">'+sectionHead('本回練習完成','Session results',name(mode))+'<div class="panel"><h2>答對 '+correct+' / '+s.ids.length+' 題</h2><p>本回正確率 '+Math.round(correct/s.ids.length*100)+'%</p>'+
      pack.categories.map(cat=>{const indices=s.ids.map((id,i)=>bank.get(id).cat===cat.id?i:-1).filter(i=>i>=0);return indices.length?'<p>'+cat.name+'　'+indices.filter(i=>s.answers[i]===bank.get(s.ids[i]).answer).length+' / '+indices.length+'</p>':'';}).join('')+
      '<div class="actions">'+(mode!=='mistakes'||mistakes().length?startButton(mode,'再練一回'):'')+'<a href="#mistakes">查看錯題本</a><a href="#home">返回總覽</a></div></div></div>';
    const q=bank.get(s.ids[s.index]);
    const answered=s.answers.length>s.index;
    const selected=s.answers[s.index];
    const ok=selected===q.answer;
    return '<div class="practice"><div class="sessionHead"><h1>'+name(mode)+'</h1><a href="#home">暫停練習</a></div><span class="hint">第 '+(s.index+1)+' / '+s.ids.length+' 題</span><div class="track"><i style="width:'+100*s.answers.length/s.ids.length+'%"></i></div><section class="panel"><span class="tag">'+escape(q.type)+'</span>'+
      (q.passage?'<div class="passage" lang="'+pack.language+'">'+escape(q.passage)+'</div>':'')+
      '<h2 class="question" lang="'+pack.language+'">'+escape(q.prompt)+'</h2><div class="choices">'+q.options.map((opt,i)=>{
        const mark=answered?(i===q.answer?'　✓ 正解':i===selected?'　✕ 你的答案':''):'';
        return '<button class="answer '+(answered?(i===q.answer?'correct':i===selected?'wrong':''):'')+'" data-answer="'+i+'" '+(answered?'disabled':'')+'><span>'+String.fromCharCode(65+i)+'</span><bdi lang="'+pack.language+'">'+escape(opt)+'</bdi>'+mark+'</button>';
      }).join('')+'</div>'+(answered?'<div class="feedback '+(ok?'':'miss')+'" role="status"><strong>'+(ok?'答對了':'已加入錯題本')+'</strong><p>'+escape(q.explanation)+'</p><button class="primary" data-next>'+(s.index+1===s.ids.length?'查看本回成績':'下一題')+'</button></div>':'')+'</section></div>';
  }
  function locationParts() {return location.hash.slice(1).split('/');}
  function render() {
    const [page,mode]=locationParts();
    const active=page==='resources'||page==='mistakes'?page:'home';
    document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    app.innerHTML=(storageUnavailable?'<p class="warn">此瀏覽器無法保存進度，關閉頁面後紀錄可能遺失。</p>':'')+
      (page==='practice'&&state.sessions[mode]?.ids?.every(id=>bank.has(id))?practice(mode,state.sessions[mode]):active==='mistakes'?mistakePage():active==='resources'?resourcesPage():home());
  }
  app.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if (!button) return;
    if(button.dataset.start) {start(button.dataset.start);return;}
    const [page,mode]=locationParts();
    const s=state.sessions[mode];
    if(page!=='practice'||!s||s.done) return;
    const q=bank.get(s.ids[s.index]);
    if(button.hasAttribute('data-answer') && s.answers.length===s.index) {
      const choice=Number(button.dataset.answer);
      const ok=choice===q.answer;
      s.answers.push(choice);
      const record=state.records[q.id]||{count:0,correct:0};
      record.count++;
      record.correct+=Number(ok);
      record.wrong=!ok;
      state.records[q.id]=record;
      const date=today();
      state.days[date]=(state.days[date]||0)+1;
      save();render();
      app.querySelector('[data-next]')?.focus({preventScroll:true});
      app.querySelector('.feedback')?.scrollIntoView({block:'nearest'});
    } else if(button.hasAttribute('data-next') && s.answers.length>s.index) {
      if(s.index+1===s.ids.length)s.done=true;else s.index++;
      save();render();window.scrollTo(0,0);
      app.querySelector('[data-answer]')?.focus({preventScroll:true});
    }
  });
  document.title='臨時抱佛腳｜'+pack.title;
  document.querySelector('#course').textContent=pack.label;
  document.querySelector('#footerTopic').textContent=pack.name+' '+pack.label;
  window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
  render();
})();
