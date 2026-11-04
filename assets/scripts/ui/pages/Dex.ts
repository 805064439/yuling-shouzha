// 图鉴页（代码驱动 UI）
// 对应原 src/main.js 的渲染图鉴：展示全部精灵，已拥有可点入详情。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { SPIRITS, spiritStats, spiritResPath } from '../../logic/Spirits';
import { RARITY_COLOR, EVOLUTION } from '../../logic/GameConfig';
import { makeLabel, makeButton, makePanel, makeSpirit, flowGrid, attachClick, COLORS } from '../widgets';

export function buildDex(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;

  const title = makeLabel(root, '精怪图鉴', { fontSize: 40, color: COLORS.text });
  title.setPosition(0, 600, 0);
  const hint = makeLabel(root, '点击已拥有的精灵查看详情 / 养成', {
    fontSize: 22, color: COLORS.sub,
  });
  hint.setPosition(0, 550, 0);

  const cards: Node[] = SPIRITS.map((sp) => {
    const owned = (s.collection[sp.id] || 0) > 0;
    const card = makePanel(root, { w: 200, h: 280, bg: owned ? COLORS.panel : '#1c1e30' });
    if (!owned) card.setPosition(card.position.x, card.position.y, 0);
    const prog = s.prog[sp.id] || { star: 1, evo: 0 };
    makeSpirit(card, spiritResPath(sp, prog.evo), 150, owned ? sp.icon : '❔').setPosition(0, 55, 0);
    makeLabel(card, owned ? sp.name : '？？？', { fontSize: 24, color: owned ? RARITY_COLOR[sp.rarity] : COLORS.sub }).setPosition(0, -55, 0);
    if (owned) {
      makeLabel(card, `${EVOLUTION.stages[prog.evo]} ★${prog.star}`, { fontSize: 18, color: COLORS.sub }).setPosition(0, -85, 0);
      const st = spiritStats(sp, prog);
      makeLabel(card, `ATK ${st.atk} · HP ${st.hp}`, { fontSize: 16, color: COLORS.sub }).setPosition(0, -110, 0);
      makeLabel(card, `拥有 ×${s.collection[sp.id]}`, { fontSize: 15, color: COLORS.sub }).setPosition(0, -135, 0);
      attachClick(card, () => gm.go('detail', sp.id));
    } else {
      makeLabel(card, '未拥有', { fontSize: 18, color: COLORS.sub }).setPosition(0, -85, 0);
    }
    return card;
  });
  flowGrid(root, cards, 420, 3, 200, 280, 18);

  makeButton(root, '返回主页', () => gm.go('home'), { w: 300, h: 70 }).setPosition(0, -620, 0);
}
