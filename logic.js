// ぴたおしの決まりごと。画面（DOM）に触らない部分をここに集める。
// main.js（ブラウザ）と test.mjs（node）の両方から読む。
//
// 数（答え・予想）は数字の文字列で持つ（例 '0385'）。先頭の 0 もよい。数字は重ならない。

// 名前は変わるかもしれないので、画面と共有の文に出るものはここだけに書く
// （<head>・manifest・README・sw.js・localStorage の接頭辞は別に書き換える）。
export const APP = {
  name: 'ぴたおし',
  catch: '「ぴたり」と「おしい」で数を当てる',
  pitch: '「ぴたり」と「おしい」を手がかりに、隠れた数を当てる',
};

export const DIGIT_CHOICES = [3, 4, 5];
export const DAILY_DIGITS = 4;
export const DIST_MAX = 10;                 // 分布は 1〜10 回と「それより多い」
export const DEFAULT_SETTINGS = { v: 1, digits: 3, sound: true, seenHelp: false };

// ---- 答えと判定 ----

// 0〜9 を混ぜて（Fisher–Yates）先頭から digits 個
export function makeAnswer(digits, rand = Math.random) {
  const a = [...'0123456789'];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, digits).join('');
}

// digits 桁の、数字の重ならない数か
export const isCode = (s, digits) =>
  typeof s === 'string' && s.length === digits && /^\d+$/.test(s) && new Set(s).size === digits;

// ぴたり = 同じ場所で同じ数字。おしい = 両方に入っている数字 − ぴたり（数字は重ならないので）
export function judge(answer, guess) {
  let pita = 0, both = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) pita++;
    if (answer.includes(guess[i])) both++;
  }
  return { pita, oshi: both - pita };
}

// 共有と一覧の印。● がぴたり、○ がおしい、どちらも 0 は「・」
export const marks = ({ pita, oshi }) => '●'.repeat(pita) + '○'.repeat(oshi) || '・';

// ---- 今日の 1 問（日付から、どの端末でも同じ答え） ----

// 端末の日付（YYYY-MM-DD）
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function prevDay(key) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 文字列 → 32 ビットの数（FNV-1a）
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
// 種つきの乱数（mulberry32）
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}
// 種の 'pitaoshi:' は名前が変わっても変えない。変えると同じ日でも前の版と答えが変わる（テストで決まった日の答えを確かめている）
export const dailyAnswer = (key) => makeAnswer(DAILY_DIGITS, seeded(hash(`pitaoshi:${key}`)));

// 今日の 1 問の共有の文（数字は出さない）
export function dailyShareText(key, guesses, gaveUp) {
  const answer = dailyAnswer(key);
  const lines = guesses.map((g) => marks(judge(answer, g)));
  const head = gaveUp ? 'あきらめた' : `${DAILY_DIGITS}けた ${guesses.length}回で当てた`;
  return [`${APP.name} 今日の1問 ${key}`, head, ...lines].join('\n');
}

// ---- 保存する値 ----

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const count = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
const isDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);

// メモ: 0〜9 の数字ごとに 0 = 印なし、1 = ×（入っていない）、2 = ○（入っている）
export const emptyMemo = () => new Array(10).fill(0);
export const nextMark = (m) => (m + 1) % 3;
const readMemo = (m) => (Array.isArray(m) && m.length === 10 && m.every((x) => [0, 1, 2].includes(x)) ? m.slice() : emptyMemo());

// 予想の列: どれも桁数どおり・重ならない、同じ予想が 2 つない、答えは最後にしか来ない
function readGuesses(g, digits, answer) {
  if (!Array.isArray(g) || !g.every((x) => isCode(x, digits)) || new Set(g).size !== g.length) return null;
  const hit = g.indexOf(answer);
  return hit === -1 || hit === g.length - 1 ? g.slice() : null;
}

export function readSettings(raw) {
  const d = { ...DEFAULT_SETTINGS };
  if (!isObj(raw) || raw.v !== 1) return d;
  return {
    v: 1,
    digits: DIGIT_CHOICES.includes(raw.digits) ? raw.digits : d.digits,
    sound: raw.sound !== false,
    seenHelp: raw.seenHelp === true,
  };
}

const emptySolo = () => ({ plays: 0, wins: 0, best: null, total: 0 });
const emptyDist = () => {
  const d = { more: 0 };
  for (let i = 1; i <= DIST_MAX; i++) d[i] = 0;
  return d;
};

// today = その日の 1 問の続き・結果 { date, guesses, memo, done, gaveUp }（ないなら null）
export function readStats(raw) {
  const s = { v: 1, solo: {}, daily: { last: null, streak: 0, maxStreak: 0, dist: emptyDist(), today: null } };
  for (const k of DIGIT_CHOICES) s.solo[k] = emptySolo();
  if (!isObj(raw) || raw.v !== 1) return s;
  if (isObj(raw.solo)) {
    for (const k of DIGIT_CHOICES) {
      const r = raw.solo[k];
      if (!isObj(r)) continue;
      s.solo[k] = {
        plays: count(r.plays), wins: count(r.wins), total: count(r.total),
        best: Number.isInteger(r.best) && r.best > 0 ? r.best : null,
      };
    }
  }
  const d = raw.daily;
  if (isObj(d)) {
    s.daily.last = isDate(d.last) ? d.last : null;
    s.daily.streak = count(d.streak);
    s.daily.maxStreak = Math.max(count(d.maxStreak), s.daily.streak);
    if (isObj(d.dist)) for (const k of Object.keys(s.daily.dist)) s.daily.dist[k] = count(d.dist[k]);
    s.daily.today = readToday(d.today);
  }
  return s;
}

function readToday(t) {
  if (!isObj(t) || !isDate(t.date)) return null;
  const answer = dailyAnswer(t.date);
  const guesses = readGuesses(t.guesses, DAILY_DIGITS, answer);
  if (!guesses) return null;
  const won = guesses.at(-1) === answer;
  const gaveUp = !won && t.gaveUp === true;
  return { date: t.date, guesses, memo: readMemo(t.memo), done: won || gaveUp, gaveUp };
}

// 途中のひとりのゲーム { v, mode: 'solo', digits, answer, guesses, memo }。読めない・終わっているなら null
export function readGame(raw) {
  if (!isObj(raw) || raw.v !== 1 || raw.mode !== 'solo' || !DIGIT_CHOICES.includes(raw.digits)) return null;
  if (!isCode(raw.answer, raw.digits)) return null;
  const guesses = readGuesses(raw.guesses, raw.digits, raw.answer);
  if (!guesses || guesses.includes(raw.answer)) return null;
  return { v: 1, mode: 'solo', digits: raw.digits, answer: raw.answer, guesses, memo: readMemo(raw.memo) };
}

// ひとりが終わった。turns = 当てた回数、あきらめたら null。自己ベストを更新したら true
export function recordSolo(stats, digits, turns) {
  const r = stats.solo[digits];
  r.plays++;
  if (turns == null) return false;
  r.wins++;
  r.total += turns;
  if (r.best != null && r.best <= turns) return false;
  r.best = turns;
  return true;
}

// 今日の 1 問が終わった。連続日数: 前回が昨日なら +1、それより前なら 1 から
export function recordDaily(stats, key, turns) {
  const d = stats.daily;
  if (d.last === key) return;              // 同じ日は 1 回だけ数える
  d.streak = d.last === prevDay(key) ? d.streak + 1 : 1;
  d.maxStreak = Math.max(d.maxStreak, d.streak);
  d.last = key;
  if (turns != null) d.dist[turns <= DIST_MAX ? turns : 'more']++;
}

// 今見せる連続日数（昨日も今日も遊んでいなければ 0）
export const currentStreak = (stats, key) =>
  (stats.daily.last === key || stats.daily.last === prevDay(key) ? stats.daily.streak : 0);
