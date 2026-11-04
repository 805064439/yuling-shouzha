// 首页 / 主菜单（代码驱动 UI）
// 对应原 src/main.js 的 boot/home 入口。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { makeLabel, makeButton, flowV, COLORS } from '../widgets';

function upgradeCost(level: number): number {
  return 50 + level * 50;
}

export function buildHome(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;

  const title = makeLabel(root, '育灵手札', { fontSize: 52, color: COLORS.text });
  title.setPosition(0, 560, 0);
  const sub = makeLabel(root, '挂机养成 · 育灵修行', { fontSize: 24, color: COLORS.sub });
  sub.setPosition(0, 500, 0);

  const info = makeLabel(
    root,
    `主角 Lv.${s.level}　灵气 ${Math.floor(s.gold)}　灵核 ${s.cores}　券 ${s.tickets}`,
    { fontSize: 26, color: COLORS.text },
  );
  info.setPosition(0, 430, 0);

  const upBtn = makeButton(
    root,
    `升级 (花费 ${upgradeCost(s.level)} 灵气)`,
    () => {
      const cost = upgradeCost(s.level);
      if (s.gold >= cost) {
        s.gold -= cost;
        s.level += 1;
        gm.save();
        gm.refreshTop();
        buildHome(root, gm);
      } else gm.toast('灵气不足');
    },
    { w: 380, h: 76, bg: COLORS.btnPrimary },
  );
  upBtn.setPosition(0, 350, 0);

  const entries: Node[] = [];
  const mk = (label: string, key: string) => {
    entries.push(makeButton(root, label, () => gm.go(key), { w: 380, h: 76 }));
  };
  mk('🛡 编队出战', 'team');
  mk('🎴 召唤精怪', 'gacha');
  mk('⚔ 自动战斗', 'battle');
  mk('🏪 灵物商店', 'shop');
  flowV(root, entries, 230, 28);
}
