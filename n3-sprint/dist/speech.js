// Listening playback with the Web Speech API (speechSynthesis, ja-JP).
// Handles async voice loading, per-speaker voices/pitch, and Chrome's habit of
// silently stopping long utterances (we split lines and keep the engine awake).
globalThis.Speech = (() => {
  const synth = globalThis.speechSynthesis;
  const supported = Boolean(synth && globalThis.SpeechSynthesisUtterance);
  const ua = navigator.userAgent;
  const isChromeDesktop = /Chrome\//.test(ua) && !/Android|Mobile|Edg\//.test(ua);

  const VOICE_STYLE = {
    M: {pitch: 0.8, rate: 1},
    F: {pitch: 1.2, rate: 1},
    M2: {pitch: 0.65, rate: 0.94},
    F2: {pitch: 1.45, rate: 1.05},
    N: {pitch: 1, rate: 0.95}
  };
  const MALE = /otoya|hattori|ichiro|keita|daichi|naoki|male|男/i;
  const FEMALE = /kyoko|o-ren|haruka|ayumi|nanami|sayaka|mizuki|female|女/i;

  let voices = [];
  let voicesSettled = false;
  const waiters = [];

  function refreshVoices() {
    if (!supported) return;
    voices = synth.getVoices().filter(v => /^ja([-_]|$)/i.test(v.lang));
    if (voices.length) settle();
  }
  function settle() {
    if (voicesSettled) return;
    voicesSettled = true;
    waiters.splice(0).forEach(fn => fn());
  }
  if (supported) {
    refreshVoices();
    synth.addEventListener?.('voiceschanged', refreshVoices);
    // Some browsers never fire voiceschanged; give up waiting after a while.
    setTimeout(settle, 2500);
  } else {
    voicesSettled = true;
  }

  // Calls fn once we know whether Japanese voices exist.
  function whenReady(fn) {
    if (voicesSettled) fn();
    else waiters.push(fn);
  }
  const status = () => (!supported ? 'unsupported' : !voicesSettled ? 'loading' : voices.length ? 'ok' : 'novoice');

  function voiceFor(speaker) {
    if (!voices.length) return null;
    const male = voices.filter(v => MALE.test(v.name));
    const female = voices.filter(v => FEMALE.test(v.name));
    const other = voices.filter(v => !male.includes(v) && !female.includes(v));
    const pick = (list, i) => list[i] || list[0];
    switch (speaker) {
      case 'M': return pick(male, 0) || pick(other, 0) || voices[0];
      case 'M2': return pick(male, 1) || pick(other, 1) || voices[1] || voices[0];
      case 'F': return pick(female, 0) || pick(other, 0) || voices[0];
      case 'F2': return pick(female, 1) || pick(other, 1) || voices[1] || voices[0];
      default: return pick(other, 0) || pick(female, 0) || voices[0];
    }
  }

  // Split long lines at sentence/comma boundaries so Chrome does not cut them off.
  function chunks(text, max = 60) {
    const parts = String(text).match(/[^。！？!?]+[。！？!?]*/g) || [String(text)];
    const out = [];
    for (const part of parts) {
      if (part.length <= max) { out.push(part); continue; }
      let buf = '';
      for (const piece of part.split(/(?<=、)/)) {
        if ((buf + piece).length > max && buf) { out.push(buf); buf = ''; }
        buf += piece;
      }
      if (buf) out.push(buf);
    }
    return out.map(s => s.trim()).filter(Boolean);
  }

  // ---------- playback ----------
  let run = 0;          // increments on every play/stop to invalidate old callbacks
  let keepAlive = null;
  let live = [];        // keep utterances referenced (Chrome GC drops onend otherwise)

  function stop() {
    run++;
    clearInterval(keepAlive);
    keepAlive = null;
    live = [];
    if (supported) synth.cancel();
  }

  // items: [{speaker, text, label}] ; hooks: onItem(index), onDone()
  function play(items, {rate = 1, onItem, onDone} = {}) {
    stop();
    if (!supported) return;
    const id = run;
    const queue = [];
    items.forEach((item, index) => {
      chunks(item.text).forEach((text, k) => queue.push({...item, text, index, first: k === 0}));
    });
    if (isChromeDesktop) {
      keepAlive = setInterval(() => {
        if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
      }, 10000);
    }
    let pos = 0;
    const next = () => {
      if (id !== run) return;
      if (pos >= queue.length) {
        clearInterval(keepAlive);
        keepAlive = null;
        onDone?.();
        return;
      }
      const item = queue[pos++];
      if (item.first) onItem?.(item.index);
      const style = VOICE_STYLE[item.speaker] || VOICE_STYLE.N;
      // Engines tend to read 今日は as こんにちは and 今日中 as きょうちゅう.
      const u = new SpeechSynthesisUtterance(item.text.replace(/今日中/g, 'きょうじゅう').replace(/今日/g, 'きょう'));
      u.lang = 'ja-JP';
      const voice = voiceFor(item.speaker);
      if (voice) u.voice = voice;
      u.pitch = style.pitch;
      u.rate = style.rate * rate;
      // Short pause between speakers, like a recording.
      const gap = item.first ? 350 : 60;
      let finished = false;
      const advance = () => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        setTimeout(next, gap);
      };
      u.onend = advance;
      u.onerror = event => {
        if (event.error !== 'interrupted' && event.error !== 'canceled') console.warn('speech error', event.error);
        advance();
      };
      // Safety net if onend never fires: generous time estimate per character.
      const watchdog = setTimeout(advance, 4000 + item.text.length * 450 / (u.rate || 1));
      live.push(u);
      synth.speak(u);
    };
    // Chrome sometimes ignores speak() right after cancel(); defer a tick.
    setTimeout(next, 80);
  }

  return {supported, status, whenReady, play, stop, chunks};
})();
