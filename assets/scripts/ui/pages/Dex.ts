// 图鉴页（代码驱动 UI）
// 对应原 src/main.js 的渲染图鉴：展示全部精灵，已拥有可点入详情。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { SPIRITS, spiritStats, spiritResPath } from '../../logic/Spirits';
import { RARITY_COLOR, EVOLUTION } from '../../logic/GameConfig';
import { makeLabel, makeButton, makePanel, makeSpirit, flowGrid, attachClick, shadeHex, COLORS } from '../widgets';

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
    // 双面层：已拥有 = 纸面卡（paper 切图）；未获得 = deep 内嵌卡（deep 切图，README §1 指定用途）
    const card = makePanel(root, owned
      ? { w: 200, h: 280, surface: 'paper' }
      : { w: 200, h: 280, bg: COLORS.panelDeep });
    const prog = s.prog[sp.id] || { star: 1, evo: 0 };
    makeSpirit(card, spiritResPath(sp, prog.evo), 150, owned ? sp.icon : '❔').setPosition(0, 55, 0);
    makeLabel(card, owned ? sp.name : '？？？', { fontSize: 24, color: owned ? shadeHex(RARITY_COLOR[sp.rarity], -0.35) : '#8C8270' }).setPosition(0, -55, 0);
    if (owned) {
      makeLabel(card, `${EVOLUTION.stages[prog.evo]} ★${prog.star}`, { fontSize: 18, color: COLORS.ink }).setPosition(0, -85, 0);
      const st = spiritStats(sp, prog);
      makeLabel(card, `ATK ${st.atk} · HP ${st.hp}`, { fontSize: 16, color: '#6E6656' }).setPosition(0, -110, 0);
      makeLabel(card, `拥有 ×${s.collection[sp.id]}`, { fontSize: 15, color: '#6E6656' }).setPosition(0, -135, 0);
      attachClick(card, () => gm.go('detail', sp.id));
    } else {
      makeLabel(card, '未拥有', { fontSize: 18, color: '#8C8270' }).setPosition(0, -85, 0);
    }
    return card;
  });
  flowGrid(root, cards, 420, 3, 200, 280, 18);

  makeButton(root, '返回战斗', () => gm.go('battle'), { w: 300, h: 70 }).setPosition(0, -620, 0);
}
