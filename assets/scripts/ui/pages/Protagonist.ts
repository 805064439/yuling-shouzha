// 主角页：大立绘展示 + 升级（沿用旧 HTML 版数值：费用 = Lv×50 灵气，攻击 = 8 + Lv×2，
// 升级重算挂机倍率 1 + (Lv-1)*0.1 + 进化加成）。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { recalcIdleMult } from '../../logic/GameConfig';
import { makeLabel, makeButton, makeSpiritStage, makeSpirit, COLORS } from '../widgets';

export function buildProtagonist(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;
  const cost = s.level * 50;

  const title = makeLabel(root, '主角 · 小椿', { fontSize: 40, color: '#3f8f6f' });
  title.setPosition(0, 630, 0);

  // 大立绘纸舞台（与详情页同版式：400×560，立绘 360×520）
  const stage = makeSpiritStage(root, 400, 560, '#7fc9a8');
  stage.setPosition(0, 270, 0);
  makeSpirit(stage, 'spirits/protagonist', 360, '🌸', 520).setPosition(0, 0, 0);

  // 属性区
  makeLabel(root, `Lv.${s.level}　主角攻击 ${8 + s.level * 2}　挂机效率 x${(s.idleMult || 1).toFixed(1)}`, {
    fontSize: 26, color: COLORS.text,
  }).setPosition(0, -52, 0);
  makeLabel(root, `升级费用：${cost} 灵气（每级 +2 攻击、+10% 挂机效率）`, {
    fontSize: 22, color: COLORS.sub,
  }).setPosition(0, -100, 0);

  makeButton(root, `升级到 Lv.${s.level + 1}`, () => {
    if (gm.state.gold < cost) {
      gm.toast(`灵气不足，还需要 ${cost - Math.floor(gm.state.gold)} 灵气`);
      return;
    }
    gm.state.gold -= cost;
    gm.state.level += 1;
    const mult = recalcIdleMult(gm.state);
    gm.save();
    gm.toast(`升级到 Lv.${gm.state.level}！挂机效率 x${mult.toFixed(1)}`);
    gm.go('protagonist'); // 重建本页刷新等级/费用显示
  }, { w: 320, h: 78, fontSize: 26 }).setPosition(0, -190, 0);

  makeButton(root, '返回战斗', () => gm.go('battle'), { w: 220, h: 70, fontSize: 24 })
    .setPosition(0, -610, 0);
}
