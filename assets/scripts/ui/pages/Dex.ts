// 图鉴页（代码驱动 UI）—— 双页签：精怪图鉴 / 蚀灵教图鉴
// 精怪 tab：展示全部精灵，已拥有可点入详情养成。
// 蚀灵教 tab：展示全部敌人（分层排列），点开看全屏大图与设定。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { SPIRITS, spiritStats, spiritResPath } from '../../logic/Spirits';
import { RARITY_COLOR, EVOLUTION } from '../../logic/GameConfig';
import { ENEMIES, enemyResPath, TIER_NAMES } from '../../logic/Enemies';
import { makeLabel, makeButton, makePanel, makeSpirit, spiritFitScale, flowGrid, attachClick, shadeHex, COLORS } from '../widgets';

export type DexTab = 'spirit' | 'enemy';

// 卡片规格（3 列）：页签下方对齐排布
const CELL_W = 180;
const CELL_H = 250;
const GAP = 14;
const GRID_START_Y = 350; // 第一排中心

export function buildDex(root: Node, gm: GameManager, tab: DexTab = 'spirit'): void {
  root.removeAllChildren();
  const s = gm.state;

  const title = makeLabel(root, tab === 'spirit' ? '精怪图鉴' : '蚀灵教图鉴', { fontSize: 40, color: COLORS.text });
  title.setPosition(0, 600, 0);

  // —— 页签切换（当前页签高亮 btnPrimary）——
  const tabs: Array<[string, DexTab]> = [['🟢 精怪', 'spirit'], ['⚔ 蚀灵教', 'enemy']];
  tabs.forEach(([label, key], i) => {
    const active = tab === key;
    const btn = makeButton(root, label, () => { if (!active) gm.go('dex', key); }, {
      w: 200, h: 50, fontSize: 24,
      ...(active ? { bg: COLORS.btnPrimary } : {}),
    });
    btn.setPosition(-110 + i * 220, 540, 0);
  });

  let rows: number;
  if (tab === 'spirit') {
    rows = buildSpiritCards(root, gm);
  } else {
    rows = buildEnemyCards(root, gm);
  }

  // 返回按钮位置随排数自适应（避免与末排重叠）
  const lastRowBottom = GRID_START_Y - (rows - 1) * (CELL_H + GAP) - CELL_H / 2;
  makeButton(root, '返回战斗', () => gm.go('battle'), { w: 300, h: 66 })
    .setPosition(0, Math.max(lastRowBottom - 60, -620), 0);
}

// —— 精怪 tab ——
function buildSpiritCards(root: Node, gm: GameManager): number {
  const s = gm.state;

  const cards: Node[] = SPIRITS.map((sp) => {
    const owned = (s.collection[sp.id] || 0) > 0;
    // 双面层：已拥有 = 纸面卡（paper 切图）；未获得 = deep 内嵌卡（deep 切图，README §1 指定用途）
    const card = makePanel(root, owned
      ? { w: CELL_W, h: CELL_H, surface: 'paper' }
      : { w: CELL_W, h: CELL_H, bg: COLORS.panelDeep });
    const prog = s.prog[sp.id] || { star: 1, evo: 0 };
    const resPath = spiritResPath(sp, prog.evo);
    makeSpirit(card, resPath, 135, owned ? sp.icon : '❔', undefined, spiritFitScale(resPath, 135, 135)).setPosition(0, 50, 0);
    makeLabel(card, owned ? sp.name : '？？？', { fontSize: 21, color: owned ? shadeHex(RARITY_COLOR[sp.rarity], -0.35) : '#8C8270' }).setPosition(0, -50, 0);
    if (owned) {
      makeLabel(card, `${EVOLUTION.stages[prog.evo]} ★${prog.star}`, { fontSize: 16, color: COLORS.ink }).setPosition(0, -78, 0);
      const st = spiritStats(sp, prog);
      makeLabel(card, `ATK ${st.atk} · HP ${st.hp}`, { fontSize: 14, color: '#6E6656' }).setPosition(0, -101, 0);
      makeLabel(card, `拥有 ×${s.collection[sp.id]}`, { fontSize: 13, color: '#6E6656' }).setPosition(0, -122, 0);
      attachClick(card, () => gm.go('detail', sp.id));
    } else {
      makeLabel(card, '未拥有', { fontSize: 16, color: '#8C8270' }).setPosition(0, -78, 0);
    }
    return card;
  });
  flowGrid(root, cards, GRID_START_Y, 3, CELL_W, CELL_H, GAP);
  return Math.ceil(cards.length / 3);
}

// —— 蚀灵教 tab：敌人卡（全图鉴可直接查看，点开全屏大图）——
function buildEnemyCards(root: Node, gm: GameManager): number {
  // 敌方卡用冷色衬底：与精怪纸卡区分阵营；长老/教主更深的暗紫红
  const cards: Node[] = ENEMIES.map((e) => {
    const boss = e.tier >= 3;
    const card = makePanel(root, boss
      ? { w: CELL_W, h: CELL_H, bg: '#3a2432' }
      : { w: CELL_W, h: CELL_H, bg: COLORS.panelDeep });
    makeSpirit(card, enemyResPath(e.id), 135, '❓').setPosition(0, 50, 0);
    makeLabel(card, e.name, { fontSize: 20, color: boss ? '#e8b0bc' : COLORS.text }).setPosition(0, -50, 0);
    makeLabel(card, TIER_NAMES[e.tier] ?? '', { fontSize: 16, color: boss ? '#c98a9a' : '#9a8fb0' }).setPosition(0, -78, 0);
    makeLabel(card, `强度 ×${e.hpMul.toFixed(1)}`, { fontSize: 13, color: '#8C8270' }).setPosition(0, -103, 0);
    attachClick(card, () => gm.go('enemyDetail', e.id));
    return card;
  });
  flowGrid(root, cards, GRID_START_Y, 3, CELL_W, CELL_H, GAP);
  return Math.ceil(cards.length / 3);
}
