import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMINGS, timingLabel, resolveResName, reservationsOfEvent,
  eventTotals, reservationCountByEvent, sortEvents, buildEventClone, cloneReservation,
  effectiveCount, autoAmount, reservationDate, eventIncomeByDate, eventIncomeInMonth,
  reservationBack, eventIncentiveDetail, reservationSummary,
  reservationItems, reservationSales, reservationCount, itemBack, itemCount,
  eventIncomeByDateDetailed, eventBackRanking,
} from '../js/events-logic.js';

const customers = [
  { id: 'c1', name: '田中さん' },
  { id: 'c2', name: 'サトウ' },
];
const reservations = [
  { id: 'r1', eventId: 'e1', customerId: 'c1', name: '田中さん', timing: 'post', count: 2, amount: 30000, createdAt: 1 },
  { id: 'r2', eventId: 'e1', customerId: '', name: '常連Aさん', timing: 'day', count: 1, amount: 15000, createdAt: 2 },
  { id: 'r3', eventId: 'e1', customerId: 'c2', name: 'サトウ', timing: 'pre', count: 3, amount: 20000, createdAt: 3 },
  { id: 'r4', eventId: 'e2', customerId: '', name: 'ゲスト', timing: 'day', count: 1, amount: 5000, createdAt: 4 },
];

test('TIMINGS / timingLabel: 3種の種別ラベル', () => {
  assert.deepEqual(TIMINGS.map((t) => t.key), ['day', 'pre', 'post']);
  assert.equal(timingLabel('pre'), '前祝い');
  assert.equal(timingLabel('unknown'), '当日'); // フォールバック
});

test('resolveResName: 顧客紐付けは顧客名・リスト外は手入力名・削除済みは控え名', () => {
  assert.equal(resolveResName(reservations[0], customers), '田中さん');
  assert.equal(resolveResName(reservations[1], customers), '常連Aさん');
  assert.equal(resolveResName({ customerId: 'zzz', name: '元○○' }, customers), '元○○');
  assert.equal(resolveResName({ customerId: 'zzz', name: '' }, customers), '(削除済み顧客)');
});

test('reservationsOfEvent: 当日→前祝い→後祝いの順に並ぶ', () => {
  const r = reservationsOfEvent(reservations, 'e1');
  assert.deepEqual(r.map((x) => x.id), ['r2', 'r3', 'r1']); // day, pre, post
  assert.equal(reservationsOfEvent(reservations, 'e2').length, 1);
});

test('eventTotals: 件数・本数・売上・バックを合計', () => {
  assert.deepEqual(eventTotals(reservations, 'e1'), { count: 3, bottles: 6, amount: 65000, back: 0 });
  assert.deepEqual(eventTotals(reservations, 'nope'), { count: 0, bottles: 0, amount: 0, back: 0 });
});

test('reservationBack: 本数×円/件 ＋ 売上×％', () => {
  assert.equal(reservationBack({ count: 3, amount: 33000, backRate: 10 }), 3300); // 売上×10%
  assert.equal(reservationBack({ count: 2, amount: 0, backFixed: 1000 }), 2000); // 本数×円
  assert.equal(reservationBack({ count: 2, amount: 10000, backFixed: 500, backRate: 5 }), 1500); // 併用
  assert.equal(reservationBack({ count: 0, bottle: 'モエ', amount: 20000, backRate: 10 }), 2000); // 空欄+銘柄=1本
  assert.equal(reservationBack({ count: 1, amount: 5000 }), 0); // 率も円も無し→0
});

test('effectiveCount: 本数優先・空欄でも銘柄あれば1本', () => {
  assert.equal(effectiveCount({ count: 3 }), 3);
  assert.equal(effectiveCount({ count: 0, bottle: 'オリシャン' }), 1); // 空欄+銘柄→1
  assert.equal(effectiveCount({ count: 0, bottle: '' }), 0);
  assert.equal(effectiveCount({ bottle: 'モエ' }), 1);
  // 銘柄あり・本数0の予約が混じると本数合計に+1される
  const rs = [{ eventId: 'x', count: 0, bottle: 'オリシャン', amount: 11000 },
              { eventId: 'x', count: 3, bottle: 'オリシャン', amount: 11000 }];
  assert.deepEqual(eventTotals(rs, 'x'), { count: 2, bottles: 4, amount: 22000, back: 0 });
});

test('autoAmount: 実効本数×単価', () => {
  assert.equal(autoAmount(3, 'オリシャン', 10000), 30000);
  assert.equal(autoAmount(0, 'オリシャン', 10000), 10000); // 空欄+銘柄→1本×単価
  assert.equal(autoAmount(0, '', 10000), 0);
  assert.equal(autoAmount(2, '', 0), 0);
});

test('reservationCountByEvent: イベントごとの件数Map', () => {
  const m = reservationCountByEvent(reservations);
  assert.equal(m.get('e1'), 3);
  assert.equal(m.get('e2'), 1);
});

test('buildEventClone: 名前に接尾辞・予約を新idで複製・doneリセット', () => {
  const ev = { id: 'e1', name: '生誕祭2026', date: '2026-07-10', memo: 'VIP', createdAt: 100 };
  let n = 0;
  const genId = () => `new${++n}`;
  const doneRows = reservations.map((r) => ({ ...r, done: true }));
  const { event, reservations: rows } = buildEventClone(ev, doneRows, genId, ' のコピー', 999);
  assert.equal(event.id, 'new1');
  assert.equal(event.name, '生誕祭2026 のコピー');
  assert.equal(event.date, '2026-07-10');
  assert.equal(event.createdAt, 999);
  assert.equal(rows.length, 3); // e1 の予約3件のみ（e2は対象外）
  assert.deepEqual(rows.map((r) => r.eventId), ['new1', 'new1', 'new1']);
  assert.deepEqual(rows.map((r) => r.id), ['new2', 'new3', 'new4']);
  assert.ok(rows.every((r) => r.done === false)); // 対応済みはリセット
  assert.equal(rows[0].amount, doneRows[0].amount); // 中身（金額等）は維持
});

test('cloneReservation: 同一イベント内で新id・doneリセット・中身維持', () => {
  const src = { ...reservations[0], done: true };
  const c = cloneReservation(src, 'rNew', 555);
  assert.equal(c.id, 'rNew');
  assert.equal(c.eventId, src.eventId); // 同じイベント
  assert.equal(c.done, false);
  assert.equal(c.createdAt, 555);
  assert.equal(c.name, src.name);
  assert.equal(c.amount, src.amount);
  assert.equal(c.timing, src.timing);
});

test('reservationDate: 個別日付優先・無ければイベント開催日・未定は空', () => {
  const events = [{ id: 'e1', date: '2026-07-10' }, { id: 'e2', date: '' }];
  assert.equal(reservationDate({ date: '2026-07-05', eventId: 'e1' }, events), '2026-07-05');
  assert.equal(reservationDate({ date: '', eventId: 'e1' }, events), '2026-07-10'); // 開催日
  assert.equal(reservationDate({ date: '', eventId: 'e2' }, events), ''); // 開催日も無し
  assert.equal(reservationDate({ dateTBD: true, date: '2026-07-05', eventId: 'e1' }, events), ''); // 未定→空
});

test('eventIncomeInMonth: 計上日が未定(dateTBD)の予約は集計しない', () => {
  const events = [{ id: 'e1', date: '2026-07-10' }];
  const rs = [
    { eventId: 'e1', date: '2026-07-05', amount: 11000, backRate: 10, done: true }, // 1100
    { eventId: 'e1', dateTBD: true, date: '2026-07-05', amount: 50000, backRate: 10, done: true }, // 未定→除外
  ];
  assert.equal(eventIncomeInMonth(rs, events, '2026-07'), 1100);
});

test('eventIncomeByDate: 対応済みのみ・計上日ごとにバック合計', () => {
  const events = [{ id: 'e1', date: '2026-07-10' }];
  const rs = [
    { eventId: 'e1', date: '2026-07-05', amount: 11000, backRate: 10, done: true }, // 1100
    { eventId: 'e1', date: '2026-07-05', amount: 5000, backRate: 10, done: true },  // 500
    { eventId: 'e1', date: '2026-07-10', amount: 20000, backRate: 10, done: false }, // 未対応→除外
    { eventId: 'e1', date: '', amount: 3000, backRate: 10, done: true }, // 日付無→開催日7/10 : 300
  ];
  const m = eventIncomeByDate(rs, events);
  assert.equal(m.get('2026-07-05'), 1600); // 1100+500
  assert.equal(m.get('2026-07-10'), 300);  // フォールバック分のバックのみ
});

test('eventIncomeByDateDetailed: 日付ごとにイベント別の歩合内訳（複数イベントは複数）', () => {
  const events = [{ id: 'e1', name: '生誕祭', date: '2026-07-10' }, { id: 'e2', name: '周年', date: '2026-07-10' }];
  const rs = [
    { eventId: 'e1', date: '2026-07-10', amount: 11000, backRate: 10, done: true }, // 生誕祭 1100
    { eventId: 'e1', date: '2026-07-10', amount: 9000, backRate: 10, done: true },  // 生誕祭 900 → 計2000
    { eventId: 'e2', date: '2026-07-10', amount: 50000, backRate: 10, done: true }, // 周年 5000
    { eventId: 'e1', date: '2026-07-11', amount: 4000, backRate: 10, done: false }, // 未対応→除外
  ];
  const m = eventIncomeByDateDetailed(rs, events);
  assert.deepEqual(m.get('2026-07-10'), [
    { eventId: 'e2', name: '周年', back: 5000 }, // 歩合大きい順
    { eventId: 'e1', name: '生誕祭', back: 2000 },
  ]);
  assert.equal(m.has('2026-07-11'), false);
});

test('eventBackRanking: 対応済み・当月の商品を商品名ごとに歩合合算（イベント横断で同名まとめ）', () => {
  const events = [{ id: 'e1', date: '2026-07-10' }, { id: 'e2', date: '2026-07-10' }];
  const rs = [
    // モエ: e1で2本(円/件2000=4000)＋e2で1本(2000) → 計3本/6000
    { eventId: 'e1', done: true, items: [{ label: 'モエ', count: 2, backFixed: 2000 }] },
    { eventId: 'e2', done: true, items: [{ label: 'モエ', count: 1, backFixed: 2000 }] },
    // アルマンド: 売上50000×10% = 5000 / 1本
    { eventId: 'e1', done: true, items: [{ label: 'アルマンド', count: 1, amount: 50000, backRate: 10 }] },
    { eventId: 'e1', done: false, items: [{ label: 'モエ', count: 5, backFixed: 2000 }] }, // 未対応→除外
    { eventId: 'e1', date: '2026-06-30', done: true, items: [{ label: 'モエ', count: 9, backFixed: 2000 }] }, // 別月→除外
  ];
  const r = eventBackRanking(rs, events, '2026-07');
  assert.deepEqual(r, [
    { name: 'モエ', amount: 6000, count: 3 },
    { name: 'アルマンド', amount: 5000, count: 1 },
  ]);
});

test('eventIncomeInMonth: 当月の対応済みバックを合計', () => {
  const events = [{ id: 'e1', date: '2026-07-10' }];
  const rs = [
    { eventId: 'e1', date: '2026-07-05', amount: 11000, backRate: 10, done: true }, // 1100
    { eventId: 'e1', date: '2026-08-01', amount: 9000, backRate: 10, done: true },  // 別月→除外
    { eventId: 'e1', date: '2026-07-20', amount: 4000, backRate: 10, done: false }, // 未対応→除外
    { eventId: 'e1', date: '', amount: 3000, backRate: 10, done: true }, // 開催日7月 : 300
  ];
  assert.equal(eventIncomeInMonth(rs, events, '2026-07'), 1400); // 1100+300
  assert.equal(eventIncomeInMonth(rs, events, '2026-08'), 900);
});

test('reservationItems: 新モデルはitems・旧モデルは1アイテムへ変換', () => {
  const multi = { items: [{ label: 'オリシャン', count: 3 }, { label: 'フードセット', count: 1 }] };
  assert.equal(reservationItems(multi).length, 2);
  const legacy = reservationItems({ bottle: 'モエ', product: 'セット', count: 2, amount: 5000, backRate: 10 });
  assert.deepEqual(legacy, [{ label: 'モエ / セット', count: 2, unitPrice: 0, amount: 5000, backFixed: 0, backRate: 10 }]);
});

test('itemCount / itemBack: 商品アイテム単位の数量・歩合', () => {
  assert.equal(itemCount({ label: 'モエ', count: 0 }), 1); // 品名あり・数量空→1
  assert.equal(itemCount({ label: '', count: 0 }), 0);
  assert.equal(itemBack({ label: 'モエ', count: 3, amount: 30000, backRate: 10 }), 3000);
  assert.equal(itemBack({ label: 'セット', count: 2, backFixed: 500 }), 1000);
});

test('reservationSummary: 複数商品を「品名 ×数量」で連結', () => {
  const r = { items: [{ label: 'オリシャン', count: 3 }, { label: 'フードセット', count: 1 }] };
  assert.equal(reservationSummary(r), 'オリシャン ×3 / フードセット ×1');
  assert.equal(reservationSummary({ bottle: 'モエ', count: 2 }), 'モエ ×2'); // 旧モデル
});

test('複数商品の予約: 合計（数量/売上/歩合）を全アイテムで集計', () => {
  const r = { items: [
    { label: 'オリシャン', count: 3, amount: 33000, backRate: 10 }, // 3 / 33000 / 3300
    { label: 'フードセット', count: 1, amount: 5000, backRate: 5 },  // 1 / 5000 / 250
  ] };
  assert.equal(reservationCount(r), 4);
  assert.equal(reservationSales(r), 38000);
  assert.equal(reservationBack(r), 3550);
});

test('eventIncentiveDetail: イベント名ごと＋明細（金額降順・品目ラベル・0除外）', () => {
  const events = [{ id: 'e1', name: '生誕祭', date: '2026-07-10' }, { id: 'e2', name: '周年', date: '2026-07-20' }];
  const rs = [
    { eventId: 'e1', date: '2026-07-05', bottle: 'オリシャン', count: 3, amount: 11000, backRate: 10, done: true }, // 1100
    { eventId: 'e1', date: '2026-07-06', product: 'タワーセット', name: '常連A', amount: 9000, backRate: 10, done: true }, // 900・商品名
    { eventId: 'e2', date: '2026-07-20', bottle: 'モエ', count: 1, amount: 50000, backRate: 10, done: true }, // 5000
    { eventId: 'e2', date: '2026-07-21', bottle: 'ドンペリ', amount: 8000, backRate: 10, done: false }, // 未対応→除外
  ];
  const rows = eventIncentiveDetail(rs, events, '2026-07');
  assert.deepEqual(rows.map((r) => [r.name, r.total]), [['周年', 5000], ['生誕祭', 2000]]);
  const seitan = rows.find((r) => r.name === '生誕祭');
  assert.deepEqual(seitan.items, [
    { label: 'オリシャン', count: 3, amount: 1100 },
    { label: 'タワーセット', count: 1, amount: 900 }, // 品名あり・数量空→1
  ]);
  assert.equal(eventIncentiveDetail(rs, events, '2026-08').length, 0);
});

test('eventIncentiveDetail: 複数商品の予約は商品ごとに明細化して集計', () => {
  const events = [{ id: 'e1', name: '生誕祭', date: '2026-07-10' }];
  const rs = [
    { eventId: 'e1', date: '2026-07-05', done: true, items: [
      { label: 'オリシャン', count: 3, amount: 33000, backRate: 10 }, // 3300
      { label: 'フードセット', count: 1, amount: 5000, backRate: 5 },  // 250
    ] },
    { eventId: 'e1', date: '2026-07-06', done: true, items: [
      { label: 'オリシャン', count: 2, amount: 22000, backRate: 10 }, // 2200 → オリシャン計5500
    ] },
  ];
  const rows = eventIncentiveDetail(rs, events, '2026-07');
  assert.deepEqual(rows[0].items, [
    { label: 'オリシャン', count: 5, amount: 5500 },
    { label: 'フードセット', count: 1, amount: 250 },
  ]);
  assert.equal(rows[0].total, 5750);
});

test('eventIncentiveDetail: 同じ品目名は数量・金額をまとめて合算', () => {
  const events = [{ id: 'e1', name: '生誕祭', date: '2026-07-10' }];
  const rs = [
    { eventId: 'e1', date: '2026-07-05', bottle: 'オリシャン', count: 3, amount: 11000, backRate: 10, done: true }, // c3 / 1100
    { eventId: 'e1', date: '2026-07-08', bottle: 'オリシャン', count: 2, amount: 9000, backRate: 10, done: true },  // c2 / 900
    { eventId: 'e1', date: '2026-07-09', bottle: 'モエ', count: 1, amount: 5000, backRate: 10, done: true },       // c1 / 500
  ];
  const rows = eventIncentiveDetail(rs, events, '2026-07');
  assert.deepEqual(rows[0].items, [
    { label: 'オリシャン', count: 5, amount: 2000 }, // 3+2本・1100+900
    { label: 'モエ', count: 1, amount: 500 },
  ]);
  assert.equal(rows[0].total, 2500);
});

test('sortEvents: 日付の新しい順→日付なしは末尾', () => {
  const events = [
    { id: 'a', date: '2026-07-01', createdAt: 1 },
    { id: 'b', date: '', createdAt: 5 },
    { id: 'c', date: '2026-08-10', createdAt: 2 },
  ];
  assert.deepEqual(sortEvents(events).map((e) => e.id), ['c', 'a', 'b']);
});
