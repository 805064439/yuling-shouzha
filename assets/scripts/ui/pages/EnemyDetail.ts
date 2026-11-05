// 敌人详情页（蚀灵教图鉴点入）—— 全屏大立绘 + 层级称号 + 设定描述
// 版式对齐精怪详情页：400×560 纸舞台 + 360×520 大立绘，衬底按层级冷色。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { ENEMY_BY_ID, enemyResPath, TIER_NAMES } from '../../logic/Enemies';
import { makeLabel, makeButton, makeSpirit, makeSpiritStage, COLORS } from '../widgets';

// 层级 → 舞台衬底色（与战斗页 tierStageColor 一致）
const TIER_STAGE: Record<number, string> = {
  1: '#5a5468',
  2: '#6e4a68',
  3: '#7a3e50',
  4: '#8a3050',
};

export function buildEnemyDetail(root: Node, gm: GameManager, id: string): void {
  root.removeAllChildren();
  const e = ENEMY_BY_ID[id];
  if (!e) {
    gm.go('dex', 'enemy');
    return;
  }
  const boss = e.tier >= 3;
  const accent = boss ? '#e8b0bc' : COLORS.text;
  const sub = boss ? '#c98a9a' : '#9a8fb0';

  const title = makeLabel(root, e.name, { fontSize: 40, color: accent });
  title.setPosition(0, 630, 0);
  makeLabel(root, `蚀灵教 · ${TIER_NAMES[e.tier] ?? '？？？'} · 强度 ×${e.hpMul.toFixed(1)}`, {
    fontSize: 22, color: sub,
  }).setPosition(0, 588, 0);

  // 全屏大立绘（铁律：深底不放裸立绘 → 坐层级冷色纸舞台）
  const stage = makeSpiritStage(root, 400, 560, TIER_STAGE[e.tier] ?? '#5a5468');
  stage.setPosition(0, 250, 0);
  makeSpirit(stage, enemyResPath(e.id), 360, '❓', 520).setPosition(0, 0, 0);

  // 设定描述（浅条深字，双行）
  const desc = makeLabel(root, e.desc, { fontSize: 22, color: COLORS.text, wrapWidth: 620 });
  desc.setPosition(0, -145, 0);

  makeButton(root, '返回图鉴', () => gm.go('dex', 'enemy'), { w: 300, h: 70 }).setPosition(0, -300, 0);
}
