// 编队页（代码驱动 UI）
// 对应原 src/main.js 的编队：选最多 team.size 只已拥有精灵上阵。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { SPIRITS, spiritStats, spiritResPath } from '../../logic/Spirits';
import { GAME_CONFIG, RARITY_COLOR, EVOLUTION } from '../../logic/GameConfig';
import {
  makeLabel,
  makeButton,
  makePanel,
  makeSpirit,
  flowGrid,
  attachClick,
  setLine,
  shadeHex,
  COLORS,
} from '../widgets';

export function buildTeam(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;
  const size = GAME_CONFIG.team.size;

  const title = makeLabel(root, `编队出战 (${s.team.length}/${size})`, {
    fontSize: 40,
    color: COLORS.text,
  });
  title.setPosition(0, 600, 0);

  const hint = makeLabel(root, `点击精灵加入/移出队伍，最多上阵 ${size} 只`, {
    fontSize: 22,
    color: COLORS.sub,
    wrapWidth: 640,
  });
  hint.setPosition(0, 545, 0);

  const owned = SPIRITS.filter((x) => (s.collection[x.id] || 0) > 0);
  if (owned.length === 0) {
    const empty = makeLabel(root, '尚未拥有任何精怪，去召唤吧！', {
      fontSize: 26,
      color: COLORS.sub,
    });
    empty.setPosition(0, 300, 0);
    makeButton(root, '前往召唤', () => gm.go('gacha'), {
      w: 300,
      h: 72,
      bg: COLORS.btnPrimary,
    }).setPosition(0, 200, 0);
    return;
  }

  const cards: Node[] = owned.map((sp) => {
    const inTeam = s.team.includes(sp.id);
    const prog = s.prog[sp.id] || { star: 1, evo: 0 };
    const st = spiritStats(sp, prog);
    // 纸面卡片（内容载体）；上阵高亮 = 金描边（不做深色异类卡，保持纸面统一）
    const card = makePanel(root, { w: 200, h: 270, surface: 'paper' });
    if (inTeam) setLine(card, COLORS.btnPrimary);
    const spr = makeSpirit(card, spiritResPath(sp, prog.evo), 150, sp.icon);
    spr.setPosition(0, 55, 0);
    // 纸面文字用深色系：稀有度色压暗保证对比（README §4 色板锚点）
    makeLabel(card, sp.name, { fontSize: 24, color: shadeHex(RARITY_COLOR[sp.rarity], -0.35) }).setPosition(0, -55, 0);
    makeLabel(card, `${EVOLUTION.stages[prog.evo]} ★${prog.star}`, {
      fontSize: 18,
      color: COLORS.ink,
    }).setPosition(0, -85, 0);
    makeLabel(card, `ATK ${st.atk} · HP ${st.hp}`, { fontSize: 17, color: '#6E6656' }).setPosition(
      0,
      -110,
      0,
    );
    if (inTeam) {
      makeLabel(card, '✓ 上阵', { fontSize: 20, color: shadeHex('#5FAE57', -0.25) }).setPosition(0, -140, 0);
    }
    attachClick(card, () => toggleTeam(gm, sp.id));
    return card;
  });
  flowGrid(root, cards, 410, 3, 200, 270, 22);

  makeButton(root, '返回主页', () => gm.go('home'), { w: 300, h: 70 }).setPosition(0, -560, 0);
}

function toggleTeam(gm: GameManager, id: string): void {
  const s = gm.state;
  const size = GAME_CONFIG.team.size;
  const i = s.team.indexOf(id);
  if (i >= 0) {
    s.team.splice(i, 1);
  } else {
    if (s.team.length >= size) {
      gm.toast(`最多上阵 ${size} 只`);
      return;
    }
    s.team.push(id);
  }
  gm.save();
  gm.go('team'); // 刷新本页
}
