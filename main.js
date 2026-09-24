import * as L from './logic.js';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。
// キーは必ず 'near-pin.' で始める。
const STORE = 'near-pin.';

function load(key, fallback) {
  try {
    const v = localStorage.getItem(STORE + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
}
function remove(key) {
  try { localStorage.removeItem(STORE + key); } catch { /* 消せなくても遊べる */ }
}

WebAppKit.init({ title: L.APP.name, text: L.APP.pitch });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ---- 設定と記録 ----

const settings = L.readSettings(load('settings', null));
const stats = L.readStats(load('stats', null));
const saveSettings = () => save('settings', settings);
const saveStats = () => save('stats', stats);

// ---- 音（Web Audio で作る。ファイルは使わない） ----

// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}
setAudioSession(settings.sound);

let actx = null;
function tone(freq, { dur = 0.08, type = 'sine', gain = 0.07, delay = 0, to = null } = {}) {
  if (!settings.sound) return;
  try {
    setAudioSession(true);
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* 音が出せなくても遊べる */ }
}
const sfx = {
  key: (d) => tone(440 * 2 ** (d / 24), { dur: 0.06, type: 'triangle', to: 300 }),   // 「ポッ」。数字ごとに少し高さを変える
  del: () => tone(260, { dur: 0.06, type: 'triangle', to: 180 }),
  memo: () => tone(2200, { dur: 0.02, type: 'square', gain: 0.015 }),
  tap: () => tone(600, { dur: 0.05, type: 'triangle', gain: 0.05, to: 420 }),
  nope: () => tone(120, { dur: 0.05, gain: 0.05 }),
  // ぴたりの数だけ高い「ピッ」、続けておしいの数だけやわらかい「ポッ」。0・0 は低い「トン」
  judge: ({ pita, oshi }) => {
    if (!pita && !oshi) { tone(150, { dur: 0.14, type: 'triangle', gain: 0.1, to: 110 }); return; }
    let i = 0;
    for (; i < pita; i++) tone(1320, { dur: 0.06, type: 'square', gain: 0.03, delay: i * 0.08 });
    for (let k = 0; k < oshi; k++, i++) tone(520, { dur: 0.08, type: 'triangle', gain: 0.07, delay: i * 0.08, to: 400 });
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.28, type: 'triangle', gain: 0.07, delay: i * 0.16 })),
  giveup: () => [392, 294].forEach((f, i) => tone(f, { dur: 0.22, type: 'triangle', gain: 0.07, delay: i * 0.18 })),
};

// ---- 画面 ----

const $ = (id) => document.getElementById(id);
const titleEl = $('title'), playEl = $('play'), resultEl = $('result');
const rowsEl = $('rows'), logEl = $('log'), slotsEl = $('slots'), memoEl = $('memo'), padEl = $('pad'), msgEl = $('msg');

// 名前とひとことは logic.js の APP から入れる
for (const el of document.querySelectorAll('[data-app]')) el.textContent = L.APP[el.dataset.app];

function show(screen) {
  titleEl.hidden = screen !== titleEl;
  playEl.hidden = screen !== playEl;
  window.scrollTo(0, 0);
}

const codeHtml = (s) => [...s].map((c) => `<span>${c}</span>`).join('');

// ---- タイトル ----

const segEl = $('digits-seg');
segEl.innerHTML = L.DIGIT_CHOICES.map((d) =>
  `<button class="seg__btn" role="radio" data-digits="${d}"><b>${d} けた</b><small></small></button>`).join('');
$('howto').open = !settings.seenHelp;

// 今日の 1 問の状態。日付が変わっていたら新しい問題
function todayState(key) {
  const t = stats.daily.today;
  if (t && t.date === key) return t;
  return { date: key, guesses: [], memo: L.emptyMemo(), done: false, gaveUp: false };
}

function renderTitle() {
  for (const b of segEl.children) {
    const d = +b.dataset.digits;
    b.setAttribute('aria-checked', String(d === settings.digits));
    const best = stats.solo[d].best;
    b.querySelector('small').textContent = best == null ? '記録なし' : `最少 ${best} 回`;
  }
  const saved = L.readGame(load('game', null));
  $('resume-btn').hidden = !saved;
  if (saved) $('resume-btn').textContent = `続きから（${saved.digits} けた・${saved.guesses.length + 1} 回目）`;

  const key = L.dateKey();
  const t = todayState(key);
  const streak = L.currentStreak(stats, key);
  $('daily-date').textContent = `${key.replaceAll('-', '/')}・${L.DAILY_DIGITS} けた`;
  const note = t.done ? (t.gaveUp ? '今日はあきらめた' : `今日は ${t.guesses.length} 回で当てた`)
    : t.guesses.length ? `${t.guesses.length} 回まで入れた` : 'その日は誰でも同じ答え。1 日 1 回';
  $('daily-note').textContent = [note, streak ? `連続 ${streak} 日` : ''].filter(Boolean).join('・');
  $('daily-btn').textContent = t.done ? '結果を見る' : t.guesses.length ? '続きから' : '挑戦する';

  const snd = $('sound-btn');
  snd.textContent = settings.sound ? '音 オン' : '音 オフ';
  snd.setAttribute('aria-pressed', String(settings.sound));
}

segEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-digits]');
  if (!b) return;
  settings.digits = +b.dataset.digits;
  saveSettings();
  sfx.tap();
  renderTitle();
});

$('solo-btn').addEventListener('click', () => { sfx.tap(); startSolo(settings.digits); });
$('resume-btn').addEventListener('click', () => {
  const saved = L.readGame(load('game', null));
  if (!saved) { renderTitle(); return; }
  sfx.tap();
  begin(saved);
});
$('daily-btn').addEventListener('click', () => {
  sfx.tap();
  const key = L.dateKey();
  const t = todayState(key);
  begin({ mode: 'daily', digits: L.DAILY_DIGITS, answer: L.dailyAnswer(key), date: key,
    guesses: t.guesses.slice(), memo: t.memo.slice(), done: t.done, gaveUp: t.gaveUp });
});

$('sound-btn').addEventListener('click', () => {
  settings.sound = !settings.sound;
  setAudioSession(settings.sound);
  saveSettings();
  sfx.tap();
  renderTitle();
});

// ---- 遊ぶ ----

// game = { mode, digits, answer, date（今日の 1 問）, guesses, memo, done, gaveUp }。input = 入力中の数字
let game = null;
let input = '';

function startSolo(digits) {
  begin({ mode: 'solo', digits, answer: L.makeAnswer(digits), guesses: [], memo: L.emptyMemo() });
}

function begin(g) {
  game = { done: false, gaveUp: false, ...g };
  input = '';
  if (!settings.seenHelp) { settings.seenHelp = true; saveSettings(); $('howto').open = false; }
  $('mode-name').textContent = `${game.mode === 'daily' ? '今日の 1 問' : 'ひとり'}・${game.digits} けた`;
  rowsEl.innerHTML = '';
  for (const guess of game.guesses) addRow(guess);
  slotsEl.innerHTML = '<span class="slot"></span>'.repeat(game.digits);
  msgEl.textContent = '';
  resultEl.hidden = true;
  playEl.classList.remove('over');
  armGiveup(false);
  show(playEl);
  render();
  if (game.done) finish(false);
  else { persist(); requestAnimationFrame(scrollLog); }
}

// 途中のゲームを残す。ひとりは near-pin.game（終わったら消す）、今日の 1 問は記録の中（その日の結果として残る）
function persist() {
  if (game.mode === 'solo') {
    if (game.done) remove('game');
    else save('game', { v: 1, mode: 'solo', digits: game.digits, answer: game.answer, guesses: game.guesses, memo: game.memo });
  } else {
    stats.daily.today = { date: game.date, guesses: game.guesses, memo: game.memo, done: game.done, gaveUp: game.gaveUp };
    saveStats();
  }
}

function addRow(guess) {
  const r = L.judge(game.answer, guess);
  const n = rowsEl.children.length + 1;
  const li = document.createElement('li');
  li.className = 'row';
  li.innerHTML = `<span class="row__n">${n}</span>`
    + `<span class="code">${codeHtml(guess)}</span>`
    + `<span class="row__j row__j--p"><b>${r.pita}</b><i>${'●'.repeat(r.pita)}</i></span>`
    + `<span class="row__j row__j--o"><b>${r.oshi}</b><i>${'○'.repeat(r.oshi)}</i></span>`;
  li.setAttribute('aria-label', `${n} 回目 ${[...guess].join(' ')}、ぴたり ${r.pita}、おしい ${r.oshi}`);
  rowsEl.append(li);
  return li;
}

function scrollLog() { logEl.scrollTop = logEl.scrollHeight; }

// 入力のボタン: 1 2 3 / 4 5 6 / 7 8 9 / 消す 0 決定。メモの印（× ○）を小さく出す
padEl.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button class="key" data-d="${d}">${d}</button>`).join('')
  + '<button class="key key--fn" data-act="del">消す</button>'
  + '<button class="key" data-d="0">0</button>'
  + '<button class="key key--go" data-act="go">決定</button>';
memoEl.innerHTML = Array.from({ length: 10 }, (_, d) => `<button class="chip" data-m="${d}">${d}</button>`).join('');
const MEMO_LABEL = ['印なし', '入っていない', '入っている'];

function render() {
  const { digits, guesses, memo, done } = game;
  $('turn').textContent = done ? `${guesses.length} 回` : `${guesses.length + 1} 回目`;
  $('log-empty').hidden = guesses.length > 0;
  [...slotsEl.children].forEach((el, i) => {
    el.textContent = input[i] ?? '';
    el.classList.toggle('next', i === input.length && !done);
  });
  for (const b of padEl.querySelectorAll('[data-d]')) {
    const d = b.dataset.d;
    b.disabled = done || input.includes(d);
    b.dataset.mark = memo[d];
  }
  padEl.querySelector('[data-act="del"]').disabled = done || !input.length;
  padEl.querySelector('[data-act="go"]').disabled = done || input.length !== digits;
  for (const c of memoEl.children) {
    const m = memo[c.dataset.m];
    c.dataset.mark = m;
    c.setAttribute('aria-label', `${c.dataset.m} ${MEMO_LABEL[m]}`);
    c.disabled = done;
  }
  $('giveup-btn').hidden = done;
}

function press(d) {
  if (game.done || input.length >= game.digits || input.includes(d)) { sfx.nope(); return; }
  input += d;
  msgEl.textContent = '';
  sfx.key(+d);
  render();
}
function erase() {
  if (game.done || !input) return;
  input = input.slice(0, -1);
  sfx.del();
  render();
}

function submit() {
  if (game.done) return;
  if (!L.isCode(input, game.digits)) { sfx.nope(); return; }
  const guess = input;
  const r = L.judge(game.answer, guess);
  input = '';
  armGiveup(false);
  // 同じ予想をもう一度: 判定はするが回数に数えない
  const again = game.guesses.indexOf(guess);
  if (again >= 0) {
    msgEl.textContent = `前にも入れた数です（${again + 1} 回目: ぴたり ${r.pita}・おしい ${r.oshi}）`;
    const row = rowsEl.children[again];
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    row.scrollIntoView({ block: 'nearest' });
    sfx.judge(r);
    render();
    return;
  }
  msgEl.textContent = '';
  game.guesses.push(guess);
  addRow(guess).classList.add('new');
  scrollLog();
  if (r.pita === game.digits) game.done = true;
  persist();
  render();
  if (game.done) finish(true); else sfx.judge(r);
}

padEl.addEventListener('click', (e) => {
  const b = e.target.closest('.key');
  if (!b || !game) return;
  if (b.dataset.d != null) press(b.dataset.d);
  else if (b.dataset.act === 'del') erase();
  else submit();
});

memoEl.addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c || !game || game.done) return;
  game.memo[c.dataset.m] = L.nextMark(game.memo[c.dataset.m]);
  sfx.memo();
  persist();
  render();
});

// PC: 数字キー・Backspace・Enter
document.addEventListener('keydown', (e) => {
  if (playEl.hidden || !game || !resultEl.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^\d$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') erase();
  else if (e.key === 'Enter') submit();
  else return;
  e.preventDefault();
});

// あきらめる: 1 回目は「本当に？」に変わり、3 秒以内にもう一度押すと終わる（今日の 1 問を押し間違いで失わないように）
let giveupTimer = 0;
function armGiveup(on) {
  clearTimeout(giveupTimer);
  const b = $('giveup-btn');
  b.classList.toggle('armed', on);
  b.textContent = on ? '本当に？' : 'あきらめる';
  if (on) giveupTimer = setTimeout(() => armGiveup(false), 3000);
}
$('giveup-btn').addEventListener('click', (e) => {
  if (!game || game.done) return;
  if (!e.currentTarget.classList.contains('armed')) { sfx.tap(); armGiveup(true); return; }
  armGiveup(false);
  game.done = true;
  game.gaveUp = true;
  input = '';
  persist();
  render();
  finish(true);
});

// 結果を出す。fresh = いま終わった（記録して鳴らす）。false は今日の 1 問の結果を見直すとき
let lockUntil = 0;
function finish(fresh) {
  const { mode, digits, answer, guesses, gaveUp } = game;
  const turns = guesses.length;
  let best = false;
  if (fresh) {
    if (mode === 'solo') best = L.recordSolo(stats, digits, gaveUp ? null : turns);
    else L.recordDaily(stats, game.date, gaveUp ? null : turns);
    saveStats();
    if (gaveUp) sfx.giveup(); else sfx.win();
  }
  $('result-title').textContent = gaveUp ? '答えは' : '当たり！';
  $('result-code').innerHTML = codeHtml(answer);
  $('result-turns').innerHTML = gaveUp ? `${turns} 回でやめた` : `<b>${turns}</b> 回で当てた`;
  $('result-badge').hidden = !best;
  $('again-btn').hidden = mode !== 'solo';
  $('share-btn').classList.toggle('btn--main', mode === 'daily');   // 今日の 1 問は共有が主役
  const distEl = $('dist');
  distEl.hidden = mode !== 'daily';
  if (mode === 'daily') renderDist(distEl, gaveUp ? null : turns);
  resultEl.hidden = false;
  playEl.classList.add('over');
  // 出た直後の 0.4 秒は押せない（決定の勢いで「もう一度」を押さないように）
  lockUntil = performance.now() + 400;
  resultEl.classList.add('locked');
  setTimeout(() => resultEl.classList.remove('locked'), 400);
  requestAnimationFrame(scrollLog);
}

// 今日の 1 問: 連続日数と、何回で当てたかの横棒。今日の回数の棒を目立たせる
function renderDist(el, turns) {
  const d = stats.daily.dist;
  const keys = Array.from({ length: L.DIST_MAX }, (_, i) => i + 1);
  if (d.more) keys.push('more');
  const max = Math.max(1, ...keys.map((k) => d[k]));
  el.innerHTML = `<p class="dist__head">連続 <b>${L.currentStreak(stats, game.date)}</b> 日・最長 ${stats.daily.maxStreak} 日</p>`
    + keys.map((k) => {
      const on = turns != null && (k === turns || (k === 'more' && turns > L.DIST_MAX));
      return `<div class="dist__row${on ? ' on' : ''}"><span class="dist__k">${k === 'more' ? `${L.DIST_MAX + 1}〜` : k}</span>`
        + `<span class="dist__bar" style="--w:${(d[k] / max) * 100}%"></span><span class="dist__v">${d[k]}</span></div>`;
    }).join('');
}

const unlocked = () => performance.now() >= lockUntil;

function toTitle() {
  sfx.tap();
  armGiveup(false);
  show(titleEl);
  renderTitle();
}

$('back-btn').addEventListener('click', toTitle);
$('home-btn').addEventListener('click', () => { if (unlocked()) toTitle(); });
$('again-btn').addEventListener('click', () => { if (unlocked()) { sfx.tap(); startSolo(game.digits); } });
$('share-btn').addEventListener('click', () => {
  if (!unlocked()) return;
  const text = game.mode === 'daily' ? L.dailyShareText(game.date, game.guesses, game.gaveUp)
    : game.gaveUp ? `${L.APP.name} ${game.digits}けたを ${game.guesses.length} 回まで考えて、あきらめた`
      : `${L.APP.name} ${game.digits}けたを ${game.guesses.length} 回で当てた`;
  WebAppKit.share({ text });
});

renderTitle();
