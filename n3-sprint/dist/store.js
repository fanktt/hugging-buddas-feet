// Progress state: localStorage persistence, v1 migration and Leitner scheduling.
globalThis.Store = (() => {
  const pack = globalThis.topic;
  const KEY = 'study-sprint.v2.' + pack.id;
  const OLD_KEY = 'study-sprint.v1.' + pack.id;
  // Reviews are spaced by answers, not days: `clock` counts every graded answer and a
  // record is due once the clock reaches its `dueAt`. A miss is due again right away,
  // so it comes back in the next session; correct answers wait GAPS[box - 1] answers.
  const GAPS = [60, 150, 300, 600, 1000];
  const MAX_BOX = GAPS.length;

  // ---------- dates (local calendar days as YYYY-MM-DD) ----------
  const today = () => new Date().toLocaleDateString('sv-SE');
  const parse = s => {
    const [y, m, d] = String(s).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const addDays = (s, n) => new Date(parse(s) + n * 86400000).toISOString().slice(0, 10);
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s));

  // ---------- state shape ----------
  function blank() {
    return {
      version: 3,
      clock: 0,         // graded answers so far; the time axis for reviews
      records: {},      // id -> {count, correct, box, dueAt, last, miss}
      days: {},         // date -> answered count
      sessions: {},     // practice sessions by key
      settings: {examDate: pack.defaultExamDate, dailyGoal: pack.defaultDailyGoal, rate: 1, furigana: true},
      noteMarks: {},    // note id -> {known: bool, seen: n}
      mock: null,       // exam in progress
      lastMock: null,   // last finished exam, kept for review
      mockHistory: []   // summaries
    };
  }

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

  // Accepts anything (stored or imported) and returns a well-formed state.
  function normalize(raw) {
    const s = blank();
    if (!isObj(raw)) return s;
    s.clock = Math.max(0, Math.floor(num(raw.clock)));
    if (isObj(raw.records)) {
      for (const [id, r] of Object.entries(raw.records)) {
        if (!isObj(r)) continue;
        const count = Math.max(0, num(r.count));
        const box = Math.min(MAX_BOX, Math.max(0, Math.floor(num(r.box))));
        s.records[id] = {
          count,
          correct: Math.min(count, Math.max(0, num(r.correct))),
          box,
          dueAt: Number.isFinite(r.dueAt) ? Math.max(0, Math.floor(r.dueAt)) : fromDueDate(r.due, box, s.clock),
          last: validDate(r.last) ? r.last : null,
          miss: Boolean(r.miss)
        };
      }
    }
    if (isObj(raw.days)) {
      for (const [d, n] of Object.entries(raw.days)) if (validDate(d)) s.days[d] = Math.max(0, num(n));
    }
    if (isObj(raw.sessions)) {
      for (const [k, v] of Object.entries(raw.sessions)) {
        if (isObj(v) && Array.isArray(v.ids) && Array.isArray(v.answers)) s.sessions[k] = v;
      }
    }
    if (isObj(raw.settings)) {
      const st = raw.settings;
      if (validDate(st.examDate)) s.settings.examDate = st.examDate;
      const goal = Math.floor(num(st.dailyGoal));
      if (goal >= 5 && goal <= 500) s.settings.dailyGoal = goal;
      if ([0.8, 1].includes(num(st.rate))) s.settings.rate = num(st.rate);
      if (typeof st.furigana === 'boolean') s.settings.furigana = st.furigana;
    }
    if (isObj(raw.noteMarks)) s.noteMarks = raw.noteMarks;
    if (isObj(raw.mock) && Array.isArray(raw.mock.sections)) s.mock = raw.mock;
    if (isObj(raw.lastMock) && Array.isArray(raw.lastMock.sections)) s.lastMock = raw.lastMock;
    if (Array.isArray(raw.mockHistory)) s.mockHistory = raw.mockHistory.filter(isObj).slice(-50);
    return s;
  }

  // v2 scheduled by calendar date (`due`): already due stays due, a future date
  // becomes the answer gap of its box.
  function fromDueDate(due, box, clock) {
    if (!validDate(due) || due <= today()) return clock;
    return clock + gapFor(box);
  }

  // v1: records{id:{count,correct,wrong}}, days{date:count}
  function migrate(old) {
    const s = blank();
    if (isObj(old?.records)) {
      for (const [id, r] of Object.entries(old.records)) {
        if (!isObj(r)) continue;
        const count = Math.max(0, num(r.count));
        const wrong = Boolean(r.wrong);
        s.records[id] = {
          count,
          correct: Math.min(count, Math.max(0, num(r.correct))),
          box: wrong ? 0 : 1,
          dueAt: wrong ? 0 : gapFor(1),
          last: null,
          miss: wrong
        };
      }
    }
    if (isObj(old?.days)) {
      for (const [d, n] of Object.entries(old.days)) if (validDate(d)) s.days[d] = Math.max(0, num(n));
    }
    return s;
  }

  let storageOk = true;
  let migrated = false;
  let state = blank();
  let revision = 0;   // bumped on every save; lets callers tell whether progress changed

  function load() {
    try {
      const probe = KEY + '.probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      const saved = localStorage.getItem(KEY);
      if (saved) {
        state = normalize(JSON.parse(saved));
      } else {
        const old = localStorage.getItem(OLD_KEY);
        if (old) {
          state = migrate(JSON.parse(old));
          migrated = true;
          save();
        }
      }
    } catch (error) {
      console.warn('Progress storage unavailable:', error.message);
      storageOk = false;
    }
  }

  function save() {
    revision++;
    if (!storageOk) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Saving progress failed:', error.message);
      storageOk = false;
    }
  }

  // ---------- Leitner ----------
  function daysToExam() {
    return diffDays(today(), state.settings.examDate);
  }

  // Answers to wait before a record in `box` is due again (box 0 = a miss: none).
  function gapFor(box) {
    return box > 0 ? GAPS[Math.min(box, MAX_BOX) - 1] : 0;
  }

  function blankRecord() {
    return {count: 0, correct: 0, box: 0, due: today(), last: null, miss: false};
  }

  // Grades one attempt. Returns the previous record so a "guessed" mark can undo it.
  function grade(id, ok, {countDay = true} = {}) {
    const prev = state.records[id] ? {...state.records[id]} : null;
    const r = state.records[id] ? {...state.records[id]} : blankRecord();
    const t = today();
    state.clock++;
    r.count++;
    r.last = t;
    if (ok) {
      r.correct++;
      r.box = Math.min(MAX_BOX, r.box + 1);
      r.miss = false;
    } else {
      r.box = 0;
      r.miss = true;
    }
    r.dueAt = state.clock + gapFor(r.box);
    state.records[id] = r;
    if (countDay) state.days[t] = (state.days[t] || 0) + 1;
    return prev;
  }

  // "I guessed": the correct answer does not count as mastered.
  function markGuessed(id, prev) {
    const r = state.records[id];
    if (!r) return;
    r.correct = Math.max(0, r.correct - 1);
    r.box = prev ? prev.box : 0;
    r.dueAt = state.clock;
    r.miss = true;
  }

  function isDue(r) {
    return Boolean(r && r.count > 0 && r.dueAt <= state.clock);
  }

  // Answers left before the record is due (0 = due now).
  function untilDue(r) {
    return Math.max(0, r.dueAt - state.clock);
  }

  function streak() {
    let day = today();
    if (!state.days[day]) day = addDays(day, -1);
    let n = 0;
    while (state.days[day] > 0) {
      n++;
      day = addDays(day, -1);
    }
    return n;
  }

  function reset() {
    const settings = state.settings;
    state = blank();
    state.settings = settings;
    save();
  }

  function replace(raw) {
    state = normalize(raw);
    save();
  }

  load();

  return {
    get state() { return state; },
    get storageOk() { return storageOk; },
    get migrated() { return migrated; },
    get revision() { return revision; },
    GAPS, MAX_BOX,
    today, addDays, diffDays, validDate,
    save, grade, markGuessed, isDue, untilDue, streak, daysToExam, gapFor, reset, replace, normalize
  };
})();
