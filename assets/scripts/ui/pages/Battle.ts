// 挂机战斗页（代码驱动 UI）—— 本游戏主界面
// 挂机游戏无开始按钮：进页即自动开战。展示我方编队+主角 与 敌方编队的立绘，血条 + 战斗日志。
// 全部功能入口常驻本页底部（编队/召唤/图鉴/商店）。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { Battle, BattleEvent } from '../../logic/Battle';
import { SPIRIT_BY_ID, spiritResPath } from '../../logic/Spirits';
import { EnemyDef } from '../../logic/Enemies';
import { enemyResPath } from '../../logic/Enemies';
import { RARITY_COLOR } from '../../logic/GameConfig';
import { makeLabel, makeButton, makePanel, makeSpirit, makeSpiritStage, setSize, setBg, COLORS } from '../widgets';

const ENEMY_SLOT = { w: 160, h: 175, pic: 148, picH: 158 }; // 敌方立绘槽（3 只）
const ALLY_SLOT = { w: 180, h: 205, pic: 165, picH: 182 }; // 我方立绘槽（≥4 人两行网格时使用；≤3 人自适应放大）
const ALLY_ROW_Y = [235, 5]; // 我方两行的纵坐标

export function buildBattle(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;

  // 顶部信息栏（原首页的角色状态）
  const info = makeLabel(
    root,
    `主角 Lv.${s.level}　灵气 ${Math.floor(s.gold)}　灵核 ${s.cores}　券 ${s.tickets}`,
    { fontSize: 24, color: COLORS.text },
  );
  info.setPosition(0, 628, 0);

  // —— 敌方编队（蚀灵教）——
  const hpBg = makePanel(root, { w: 620, h: 40, bg: '#3a2030' });
  hpBg.setPosition(0, 566, 0);
  const hpFill = makePanel(hpBg, { w: 620, h: 40, bg: '#e05a6f' });
  hpFill.setPosition(0, 0, 1);
  const hpLbl = makeLabel(hpBg, '敌方 · 第 1 波', { fontSize: 20, color: '#ffffff' });
  hpLbl.setPosition(0, 0, 2);

  const enemyRow = new Node('enemyRow');
  root.addChild(enemyRow);
  enemyRow.setPosition(0, 455, 0);
  // 蚀灵教分层衬底色：杂兵灰墨 / 弟子浊紫 / 长老与教主暗朱
  const tierStageColor: Record<number, string> = {
    1: '#5a5468',
    2: '#6e4a68',
    3: '#7a3e50',
    4: '#8a3050',
  };
  const renderEnemies = (team: EnemyDef[]): void => {
    enemyRow.removeAllChildren();
    const n = team.length;
    const gap = ENEMY_SLOT.w + 28;
    team.forEach((e, i) => {
      const x = (i - (n - 1) / 2) * gap;
      // 铁律：深底不放裸立绘 → 敌方立绘坐分层冷色纸舞台
      const stage = makeSpiritStage(enemyRow, ENEMY_SLOT.w, ENEMY_SLOT.h, tierStageColor[e.tier] ?? '#5a5468');
      stage.setPosition(x, 0, 0);
      makeSpirit(stage, enemyResPath(e.id), ENEMY_SLOT.pic, '❓', ENEMY_SLOT.picH).setPosition(0, 0, 0);
      const tierTag = e.tier >= 4 ? '【教主】' : e.tier === 3 ? '【长老】' : '';
      makeLabel(enemyRow, tierTag + e.name, { fontSize: e.tier >= 3 ? 19 : 18, color: e.tier >= 3 ? '#e8b0bc' : COLORS.text })
        .setPosition(x, -ENEMY_SLOT.h / 2 - 14, 0);
    });
  };
  renderEnemies([]);

  // —— 我方编队 + 主角（数量自适应：少则居中放大，多则两行网格，每行按实际人数居中）——
  makeLabel(root, '我方', { fontSize: 20, color: COLORS.sub }).setPosition(-320, 345, 0);
  const allyRow = new Node('allyRow');
  root.addChild(allyRow);
  allyRow.setPosition(0, 0, 0);

  const slots: Record<string, Node> = {}; // attackerId → 立绘节点（受击/出手高亮）
  const bump = (n: Node | undefined): void => {
    if (!n || !n.isValid) return;
    n.setScale(1.18, 1.18, 1);
    setTimeout(() => { if (n.isValid) n.setScale(1, 1, 1); }, 380);
  };

  const team = s.team || [];
  const count = team.length + 1; // 主角 + 编队
  // 槽位尺寸随人数缩放：人越少格越大越清楚
  const SLOT = count === 1
    ? { w: 300, h: 330, pic: 280, picH: 305 }
    : count === 2
      ? { w: 250, h: 270, pic: 230, picH: 250 }
      : count === 3
        ? { w: 210, h: 230, pic: 190, picH: 210 }
        : ALLY_SLOT; // 4 人以上两行网格，保持 180×205（两行高度已顶满可用空间）
  const singleRow = count <= 3;
  const perRow = singleRow ? count : Math.ceil(count / 2);
  const rowYs = singleRow ? [110] : ALLY_ROW_Y;
  const rowCounts = singleRow ? [count] : [perRow, count - perRow];
  const gapX = SLOT.w + 20;

  // 槽位序号 → (x, y)：主角占 0 号，编队依次排 1..5
  const allyPos = (idx: number): [number, number] => {
    const r = Math.min(Math.floor(idx / perRow), rowYs.length - 1);
    const c = idx - r * perRow;
    return [(c - (rowCounts[r] - 1) / 2) * gapX, rowYs[r]];
  };

  // 主角卡（立绘：spirits/protagonist.png，设定=执笔育灵师·小椿；emoji 仅作加载兜底）
  const [hx, hy] = allyPos(0);
  const heroStage = makeSpiritStage(allyRow, SLOT.w, SLOT.h, '#7fc9a8');
  heroStage.setPosition(hx, hy, 0);
  makeSpirit(heroStage, 'spirits/protagonist', SLOT.pic, '🌸', SLOT.picH).setPosition(0, 0, 0);
  makeLabel(allyRow, '主角·小椿', { fontSize: 17, color: COLORS.text }).setPosition(hx, hy - SLOT.h / 2 - 12, 0);
  slots['__hero'] = heroStage;

  team.forEach((id, i) => {
    const sp = SPIRIT_BY_ID[id];
    const [x, y] = allyPos(i + 1);
    const stage = makeSpiritStage(allyRow, SLOT.w, SLOT.h, sp ? (RARITY_COLOR[sp.rarity] ?? '#888888') : '#888888');
    stage.setPosition(x, y, 0);
    makeSpirit(stage, sp ? spiritResPath(sp, s.prog?.[id]?.evo ?? 0) : '', SLOT.pic, sp?.icon ?? '❓', SLOT.picH).setPosition(0, 0, 0);
    makeLabel(allyRow, sp?.name ?? '???', { fontSize: 17, color: COLORS.text }).setPosition(x, y - SLOT.h / 2 - 12, 0);
    slots[id] = stage;
  });

  // —— 战斗日志 ——
  const logPanel = makePanel(root, { w: 660, h: 175, bg: COLORS.panel });
  logPanel.setPosition(0, -235, 0);
  const logLabel = makeLabel(logPanel, '挂机战斗中…', { fontSize: 20, color: COLORS.sub, wrapWidth: 620 });
  logLabel.setPosition(0, 0, 0);

  // —— 战斗驱动：进页即战 ——
  const battle = new Battle(s, (msg: string) => {
    const cur = (logLabel.getComponent('cc.Label') as any).string || '';
    const lines = cur.split('\n').filter(Boolean);
    lines.push(msg);
    const tail = lines.slice(-5).join('\n');
    (logLabel.getComponent('cc.Label') as any).string = tail;
  });

  const onTick = (ev: BattleEvent) => {
    const w = Math.max(0, Math.min(1, ev.ratio)) * 620;
    setSize(hpFill, w, 40);
    setBg(hpFill, '#e05a6f');
    if (ev.wave) (hpLbl.getComponent('cc.Label') as any).string = `敌方 · 第 ${ev.wave} 波`;
    bump(ev.attackerId ? slots[ev.attackerId] : slots['__hero']);
    if (ev.enemyChanged) renderEnemies(battle.enemyTeam);
  };
  renderEnemies(battle.enemyTeam);
  battle.start(onTick);

  // —— 常驻功能入口（原首页菜单）——
  const nav: Array<[string, string]> = [
    ['🛡 编队出战', 'team'],
    ['🎴 召唤精怪', 'gacha'],
    ['📖 精怪图鉴', 'dex'],
    ['🏪 灵物商店', 'shop'],
    ['🌸 主角', 'protagonist'],
  ];
  nav.forEach(([label, key], i) => {
    makeButton(root, label, () => gm.go(key), { w: 142, h: 64, fontSize: 20 })
      .setPosition(-296 + i * 148, -430, 0);
  });

  // 离开本页时停止计时器，避免泄漏
  gm.cleanup = () => battle.stop();
}
