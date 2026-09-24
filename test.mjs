// node test.mjs — 画面を使わない部分のテスト（答えの作り方・判定・今日の 1 問・共有の文・保存）
import assert from 'node:assert/strict';
import * as L from './logic.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };

// 決まった日の今日の 1 問の答え（2026-09-25・2026-09-26・2027-01-01）。変わったら、同じ日に遊ぶ人どうしで答えがずれる
const PINNED = ['7963', '4765', '7061'];

// ぴたり・おしいを定義どおりに数える（比べる用）
function naive(answer, guess) {
  let pita = 0, oshi = 0;
  for (let i = 0; i < guess.length; i++) {
    for (let j = 0; j < answer.length; j++) {
      if (guess[i] === answer[j]) i === j ? pita++ : oshi++;
    }
  }
  return { pita, oshi };
}

test('判定: 仕様の例', () => {
  assert.deepEqual(L.judge('0385', '3018'), { pita: 0, oshi: 3 });
  assert.deepEqual(L.judge('0385', '0385'), { pita: 4, oshi: 0 });
  assert.deepEqual(L.judge('0385', '1267'), { pita: 0, oshi: 0 });
  assert.deepEqual(L.judge('0385', '0358'), { pita: 2, oshi: 2 });
  assert.deepEqual(L.judge('012', '120'), { pita: 0, oshi: 3 });
  assert.deepEqual(L.judge('01234', '01243'), { pita: 3, oshi: 2 });
});

test('判定: 3〜5 桁のランダムな組で、定義どおりに数えたものと一致する', () => {
  const rand = L.seeded(1);
  for (const d of L.DIGIT_CHOICES) {
    for (let i = 0; i < 5000; i++) {
      const a = L.makeAnswer(d, rand), g = L.makeAnswer(d, rand);
      assert.deepEqual(L.judge(a, g), naive(a, g), `${a} ${g}`);
    }
  }
});

test('答え: 桁数どおりで数字が重ならず、0 始まりも出る。10 個の数字がどの場所にも出る', () => {
  const rand = L.seeded(2);
  for (const d of L.DIGIT_CHOICES) {
    const seen = Array.from({ length: d }, () => new Set());
    let zero = 0;
    for (let i = 0; i < 3000; i++) {
      const a = L.makeAnswer(d, rand);
      assert.ok(L.isCode(a, d), a);
      if (a[0] === '0') zero++;
      [...a].forEach((c, k) => seen[k].add(c));
    }
    assert.ok(zero > 100);
    for (const s of seen) assert.equal(s.size, 10);
  }
});

test('入力の確かめ: 桁数・数字だけ・重なり', () => {
  assert.ok(L.isCode('0385', 4));
  assert.ok(!L.isCode('0385', 3));
  assert.ok(!L.isCode('0335', 4));
  assert.ok(!L.isCode('03a5', 4));
  assert.ok(!L.isCode(385, 3));
});

test('印: ● がぴたり、○ がおしい、両方 0 は ・', () => {
  assert.equal(L.marks({ pita: 0, oshi: 2 }), '○○');
  assert.equal(L.marks({ pita: 2, oshi: 1 }), '●●○');
  assert.equal(L.marks({ pita: 0, oshi: 0 }), '・');
});

test('今日の 1 問: 同じ日は同じ答え、決まった日の答えが前の版と変わらない', () => {
  assert.equal(L.dailyAnswer('2026-09-25'), L.dailyAnswer('2026-09-25'));
  // 版を上げても同じ日の答えが変わらないように、いくつかの日の答えを固定しておく
  assert.deepEqual(['2026-09-25', '2026-09-26', '2027-01-01'].map(L.dailyAnswer), PINNED);
  // 1 年分: どれも 4 桁の正しい数で、ほとんど毎日ちがう
  const set = new Set();
  let key = '2027-12-31';
  for (let i = 0; i < 365; i++, key = L.prevDay(key)) {
    const a = L.dailyAnswer(key);
    assert.ok(L.isCode(a, 4));
    set.add(a);
  }
  assert.equal(key, '2026-12-31');
  assert.ok(set.size > 330);
});

test('日付: 端末の日付の形と、前の日（月・年・うるう年のまたぎ）', () => {
  assert.equal(L.dateKey(new Date(2026, 8, 5, 23, 59)), '2026-09-05');
  assert.equal(L.prevDay('2026-03-01'), '2026-02-28');
  assert.equal(L.prevDay('2028-03-01'), '2028-02-29');
  assert.equal(L.prevDay('2027-01-01'), '2026-12-31');
});

test('共有の文: 数字は出さず、1 行 1 回の印', () => {
  const key = '2026-09-25', a = L.dailyAnswer(key);
  // 答えに入っていない 4 つの数字の予想（0・0）と、答えの並べ替え（おしい 4）と、答え
  const rest = [...'0123456789'].filter((c) => !a.includes(c)).slice(0, 4).join('');
  const rot = a.slice(1) + a[0];
  const text = L.dailyShareText(key, [rest, rot, a], false);
  assert.equal(text, `${L.APP.name} 今日の1問 2026-09-25\n4けた 3回で当てた\n・\n○○○○\n●●●●`);
  assert.ok(![...a].some((c) => text.split('\n').slice(2).join('').includes(c)));
  assert.equal(L.dailyShareText(key, [rest], true), `${L.APP.name} 今日の1問 2026-09-25\nあきらめた\n・`);
});

test('保存: 設定は読めない値ならはじめの値', () => {
  assert.deepEqual(L.readSettings(null), L.DEFAULT_SETTINGS);
  assert.deepEqual(L.readSettings({ v: 2, digits: 5 }), L.DEFAULT_SETTINGS);
  assert.deepEqual(L.readSettings({ v: 1, digits: 7, sound: false, seenHelp: true }), { v: 1, digits: 3, sound: false, seenHelp: true });
  assert.deepEqual(L.readSettings({ v: 1, digits: 5 }), { v: 1, digits: 5, sound: true, seenHelp: false });
});

test('保存: 途中のゲームは形と中身を確かめてから使う', () => {
  const g = { v: 1, mode: 'solo', digits: 4, answer: '0385', guesses: ['3018', '1234'], memo: [0, 1, 2, 0, 0, 0, 0, 0, 0, 0] };
  assert.deepEqual(L.readGame(g), g);
  assert.deepEqual(L.readGame({ ...g, memo: 'x' }).memo, L.emptyMemo());
  assert.equal(L.readGame({ ...g, answer: '0335' }), null);           // 重なった答え
  assert.equal(L.readGame({ ...g, digits: 3 }), null);                // 桁数が合わない
  assert.equal(L.readGame({ ...g, guesses: ['3018', '3018'] }), null); // 同じ予想が 2 つ
  assert.equal(L.readGame({ ...g, guesses: ['301'] }), null);
  assert.equal(L.readGame({ ...g, guesses: ['0385'] }), null);         // もう当たっている
  assert.equal(L.readGame({ ...g, mode: 'daily' }), null);
  assert.equal(L.readGame('x'), null);
});

test('記録: ひとりの自己ベスト・回数・あきらめた', () => {
  const s = L.readStats(null);
  assert.ok(L.recordSolo(s, 4, 7));
  assert.ok(!L.recordSolo(s, 4, 7));
  assert.ok(L.recordSolo(s, 4, 5));
  assert.ok(!L.recordSolo(s, 4, null));
  assert.deepEqual(s.solo[4], { plays: 4, wins: 3, best: 5, total: 19 });
  assert.deepEqual(s.solo[3], { plays: 0, wins: 0, best: null, total: 0 });
  // 読み直しても同じ。おかしな値は捨てる
  assert.deepEqual(L.readStats(JSON.parse(JSON.stringify(s))), s);
  const bad = L.readStats({ v: 1, solo: { 3: { plays: -1, wins: 'a', best: 0, total: 2 } }, daily: 'x' });
  assert.deepEqual(bad.solo[3], { plays: 0, wins: 0, best: null, total: 2 });
  assert.equal(bad.daily.streak, 0);
});

test('記録: 今日の 1 問の連続日数と分布', () => {
  const s = L.readStats(null);
  L.recordDaily(s, '2026-09-24', 6);
  L.recordDaily(s, '2026-09-25', 12);
  L.recordDaily(s, '2026-09-25', 3);           // 同じ日の 2 回目は数えない
  assert.equal(s.daily.streak, 2);
  assert.equal(L.currentStreak(s, '2026-09-26'), 2);
  assert.equal(L.currentStreak(s, '2026-09-27'), 0);
  L.recordDaily(s, '2026-09-28', null);        // 1 日あいた・あきらめた
  assert.equal(s.daily.streak, 1);
  assert.equal(s.daily.maxStreak, 2);
  assert.equal(s.daily.dist[6], 1);
  assert.equal(s.daily.dist.more, 1);
  assert.equal(Object.values(s.daily.dist).reduce((x, y) => x + y), 2);
});

test('記録: 今日の 1 問の続き・結果は、答えと合っているか確かめる', () => {
  const key = '2026-09-25', a = L.dailyAnswer(key);
  const other = L.makeAnswer(4, L.seeded(9));
  const wrong = other === a ? L.makeAnswer(4, L.seeded(10)) : other;
  const read = (today) => L.readStats({ v: 1, daily: { today } }).daily.today;
  assert.deepEqual(read({ date: key, guesses: [wrong] }), { date: key, guesses: [wrong], memo: L.emptyMemo(), done: false, gaveUp: false });
  assert.equal(read({ date: key, guesses: [wrong, a] }).done, true);
  assert.equal(read({ date: key, guesses: [a, wrong] }), null);        // 当たったあとに予想がある
  assert.deepEqual(read({ date: key, guesses: [a], gaveUp: true }).gaveUp, false);
  assert.equal(read({ date: key, guesses: [], gaveUp: true }).done, true);
  assert.equal(read({ date: 'きょう', guesses: [] }), null);
});

console.log(`\n${n} tests passed`);
