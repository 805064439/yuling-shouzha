// 敌人数据表 —— 「蚀灵教」全人形反派（捕猎/吞噬精怪修行的邪修教派）
// 立绘规格与我方精怪一致：640×960 透明底（源图品红幕，key_bg.py 抠像）。
// tier: 1 外门杂兵 / 2 内门弟子 / 3 长老 / 4 教主（Boss）

export interface EnemyDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  /** 血量倍率：相对基准敌人的强度系数 */
  hpMul: number;
}

export const ENEMIES: EnemyDef[] = [
  // —— 外门杂兵（前期波次）——
  { id: 'e_bone', name: '拾骨童', tier: 1, hpMul: 1.0 },
  { id: 'e_blade', name: '墨纹刀客', tier: 1, hpMul: 1.1 },
  { id: 'e_bow', name: '蚀弦手', tier: 1, hpMul: 1.0 },
  // —— 内门弟子（中期波次）——
  { id: 'e_miasma', name: '瘴幡手', tier: 2, hpMul: 1.3 },
  { id: 'e_puppet', name: '墨傀使', tier: 2, hpMul: 1.4 },
  // —— 长老（后期精英）——
  { id: 'e_lantern', name: '执灯长老', tier: 3, hpMul: 2.0 },
  { id: 'e_inkman', name: '血砚先生', tier: 3, hpMul: 2.2 },
  // —— 教主（Boss，每 30 波）——
  { id: 'e_lord', name: '蚀灵教主·馁', tier: 4, hpMul: 3.5 },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

/** 敌人立绘资源路径（resources/enemies/<id>） */
export function enemyResPath(id: string): string {
  return `enemies/${id}`;
}
