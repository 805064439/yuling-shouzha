// 自动战斗页（代码驱动 UI）
// 对应原 src/main.js 的自动战斗：用 Battle 类驱动 tick，UI 展示血条 + 日志。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { Battle, BattleEvent } from '../../logic/Battle';
import { makeLabel, makeButton, makePanel, setSize, setBg, COLORS } from '../widgets';

export function buildBattle(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;

  const title = makeLabel(root, '自动战斗', { fontSize: 40, color: COLORS.text });
  title.setPosition(0, 600, 0);

  if ((s.team || []).length === 0) {
    makeLabel(root, '请先在「编队出战」中上阵精灵', { fontSize: 26, color: COLORS.sub, wrapWidth: 640 }).setPosition(0, 300, 0);
    makeButton(root, '前往编队', () => gm.go('team'), { w: 300, h: 72, bg: COLORS.btnPrimary }).setPosition(0, 200, 0);
    makeButton(root, '返回主页', () => gm.go('home'), { w: 300, h: 70 }).setPosition(0, -600, 0);
    return;
  }

  // 血条
  const hpBg = makePanel(root, { w: 620, h: 44, bg: '#3a2030' });
  hpBg.setPosition(0, 500, 0);
  const hpFill = makePanel(hpBg, { w: 620, h: 44, bg: '#e05a6f' });
  hpFill.setPosition(0, 0, 1);
  makeLabel(hpBg, '敌人', { fontSize: 22, color: '#ffffff' }).setPosition(0, 0, 2);

  // 日志区
  const logPanel = makePanel(root, { w: 660, h: 380, bg: COLORS.panel });
  logPanel.setPosition(0, -20, 0);
  const logLabel = makeLabel(logPanel, '点击下方开始战斗', { fontSize: 22, color: COLORS.sub, wrapWidth: 620 });
  logLabel.setPosition(0, 160, 0);

  const battle = new Battle(s, (msg: string) => {
    const cur = (logLabel.getComponent('cc.Label') as any).string || '';
    const lines = cur.split('\n').filter(Boolean);
    lines.push(msg);
    const tail = lines.slice(-12).join('\n');
    (logLabel.getComponent('cc.Label') as any).string = tail;
  });

  const onTick = (ev: BattleEvent) => {
    const w = Math.max(0, Math.min(1, ev.ratio)) * 620;
    setSize(hpFill, w, 44);
    setBg(hpFill, '#e05a6f');
  };

  let running = false;
  const toggleBtn = makeButton(root, '开始战斗', () => {
    if (running) {
      battle.stop();
      running = false;
      toggleBtn.getComponent('cc.Label') && ((toggleBtn.getComponent('cc.Label') as any).string = '开始战斗');
    } else {
      battle.start(onTick);
      running = true;
      (toggleBtn.getComponent('cc.Label') as any).string = '停止战斗';
    }
  }, { w: 320, h: 76, bg: COLORS.btnPrimary });
  toggleBtn.setPosition(0, -330, 0);

  makeButton(root, '返回主页', () => gm.go('home'), { w: 300, h: 70 }).setPosition(0, -600, 0);

  // 离开本页时停止计时器，避免泄漏
  gm.cleanup = () => {
    battle.stop();
    running = false;
  };
}
