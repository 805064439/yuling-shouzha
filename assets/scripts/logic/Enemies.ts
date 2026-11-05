// 敌人数据表 —— 「蚀灵教」全人形反派（捕猎/吞噬精怪修行的邪修教派）
// 立绘规格与我方精怪一致：640×960 透明底（源图品红幕，key_bg.py 抠像）。
// tier: 1 外门杂兵 / 2 内门弟子 / 3 长老 / 4 教主（Boss）

export interface EnemyDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  /** 血量倍率：相对基准敌人的强度系数 */
  hpMul: number;
  /** 图鉴/详情页展示的设定描述 */
  desc: string;
}

/** 层级称号 */
export const TIER_NAMES: Record<number, string> = {
  1: '外门杂兵',
  2: '内门弟子',
  3: '长老',
  4: '教主',
};

export const ENEMIES: EnemyDef[] = [
  // —— 外门杂兵（前期波次）——
  { id: 'e_bone', name: '拾骨童', tier: 1, hpMul: 1.0, desc: '教派最底层的跑腿童子，背篓里装满兽骨，眼神空洞发灰。「拾骨为祭，通灵之路始于此。」' },
  { id: 'e_blade', name: '墨纹刀客', tier: 1, hpMul: 1.1, desc: '佩墨色弯刀的沉默刀修，破符布条缠柄，刀身蚀纹泛紫。「刀出无声，唯闻墨落。」' },
  { id: 'e_bow', name: '蚀弦手', tier: 1, hpMul: 1.0, desc: '挽蚀墨长弓的冷冽射手，和弓满弦如墨夜。「她的箭囊里没有箭，只有凝成的墨。」' },
  // —— 内门弟子（中期波次）——
  { id: 'e_miasma', name: '瘴幡手', tier: 2, hpMul: 1.3, desc: '肩扛「瘴」字幡旗的黑衣修士，旗面雾气缭绕、旗杆挂铜铃。「幡摇之处，灵气皆腐。」' },
  { id: 'e_puppet', name: '墨傀使', tier: 2, hpMul: 1.4, desc: '十指牵着细墨线的灰紫衣修士，线尾傀儡是被吞噬的精怪残躯。「你以为她在跳舞——其实线的那头，曾是你伙伴。」' },
  // —— 长老（后期精英）——
  { id: 'e_lantern', name: '执灯长老', tier: 3, hpMul: 2.0, desc: '半身黑甲的魁梧长老，手提绿焰灯笼——灯焰是被吞噬的灵光凝成。「灯照之处，精怪战栗。」' },
  { id: 'e_inkman', name: '血砚先生', tier: 3, hpMul: 2.2, desc: '捧血砚书写的儒雅军师，以血为墨、笔落蚀纹，身后悬浮写满扭曲符文的手札——与你的《育灵手札》互为镜像。「他以血为墨，写下精怪的终局。」' },
  // —— 教主（Boss，每 30 波）——
  { id: 'e_lord', name: '蚀灵教主·馁', tier: 4, hpMul: 3.5, desc: '白衣高冠、素白裂纹面具的教主，墨袍下摆化作流动的雾，身后漂浮着被吞噬精怪的模糊虚影。不狰狞，也不愤怒——「寂静的空无：他吞掉灵，留下空。」' },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

/** 敌人立绘资源路径（resources/enemies/<id>） */
export function enemyResPath(id: string): string {
  return `enemies/${id}`;
}
