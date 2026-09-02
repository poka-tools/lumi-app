// 業種別の歩合項目プリセット。初回オンボーディングの「お仕事は？」や、
// 歩合項目ページの「業種テンプレートから追加」で、職種に合った項目をまとめて作る。
// 金額・％は 0（ユーザーが自分のレートを入力）。単位とアイコンだけ用意しておく。

export const OCCUPATIONS = [
  { key: 'concafe', label: 'コンカフェ', emoji: '🎀' },
  { key: 'cabakura', label: 'キャバクラ', emoji: '🥂' },
  { key: 'girlsbar', label: 'ガルバ', emoji: '🍸' },
  { key: 'idol', label: '地下アイドル', emoji: '🎤' },
  { key: 'other', label: 'その他', emoji: '✨' },
];

// [表示名, 単位, アイコン絵文字]
const PRESETS = {
  concafe: [
    ['チェキ', '枚', '🎀'],
    ['ドリンク', '杯', '🥤'],
    ['指名', '件', '⭐'],
    ['同伴', '件', '👥'],
    ['ボトル', '本', '🍾'],
  ],
  cabakura: [
    ['本指名', '件', '⭐'],
    ['場内指名', '件', '👑'],
    ['同伴', '件', '👥'],
    ['延長', '回', '⏰'],
    ['シャンパン', '本', '🍾'],
  ],
  girlsbar: [
    ['指名', '件', '⭐'],
    ['同伴', '件', '👥'],
    ['ドリンク', '杯', '🥤'],
    ['延長', '回', '⏰'],
    ['ボトル', '本', '🍾'],
  ],
  idol: [
    ['チェキ', '枚', '🎀'],
    ['物販', '件', '💎'],
    ['チケットバック', '件', '🎉'],
    ['配信投げ銭', '件', '💰'],
    ['サイン', '枚', '⭐'],
  ],
  other: [],
};

export function occupationLabel(key) {
  return (OCCUPATIONS.find((o) => o.key === key) || {}).label || '';
}

// 指定職種の歩合項目を作る。genId=id採番関数、startOrder=既存件数（末尾に追加するため）。
export function occupationBackItems(occKey, genId, startOrder = 0) {
  const defs = PRESETS[occKey] || [];
  return defs.map((d, i) => ({
    id: genId(),
    name: d[0],
    kind: 'income',
    fixedValue: 0,
    rateValue: 0,
    unit: d[1],
    icon: d[2],
    category: '',
    order: startOrder + i,
  }));
}
