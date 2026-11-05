// 挂机战斗页（代码驱动 UI）—— 本游戏主界面
// 挂机游戏无开始按钮：进页即自动开战。展示我方编队+主角 与 敌方编队的立绘，血条 + 战斗日志。
// 全部功能入口常驻本页底部（编队/召唤/图鉴/商店）。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { Battle, BattleEvent } from '../../logic/Battle';
import { SPIRIT_BY_ID, spiritResPath } from '../../logic/Spirits';
import { RARITY_COLOR } from '../../logic/GameConfig';
import { makeLabel, makeButton, makePanel, makeSpirit, makeSpiritStage, setSize, setBg, COLORS } from '../widgets';

const ENEMY_SLOT = { w: 160, h: 175, pic: 148, picH: 158 }; // 敌方立绘槽（3 只）
const ALLY_SLOT = { w: 180, h: 205, pic: 165, picH: 182 }; // 我方立绘槽（主角 + 最多 5 只，两行三列）
const ALLY_ROW_Y = [235, 5]; // 我方两行的纵坐标
const ALLY_GAP = ALLY_SLOT.w + 16;

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

  // —— 敌方编队 ——
  const hpBg = makePanel(root, { w: 620, h: 40, bg: '#3a2030' });
  hpBg.setPosition(0, 566, 0);
  const hpFill = makePanel(hpBg, { w: 620, h: 40, bg: '#e05a6f' });
  hpFill.setPosition(0, 0, 1);
  makeLabel(hpBg, '敌方', { fontSize: 20, color: '#ffffff' }).setPosition(0, 0, 2);

  const enemyRow = new Node('enemyRow');
  root.addChild(enemyRow);
  enemyRow.setPosition(0, 455, 0);
  const renderEnemies = (ids: string[]): void => {
    enemyRow.removeAllChildren();
    const n = ids.length;
    const gap = ENEMY_SLOT.w + 28;
    ids.forEach((id, i) => {
      const sp = SPIRIT_BY_ID[id];
      const x = (i - (n - 1) / 2) * gap;
      // 铁律：深底不放裸立绘 → 敌方立绘坐暗红衬纸舞台
      const stage = makeSpiritStage(enemyRow, ENEMY_SLOT.w, ENEMY_SLOT.h, '#a04a5e');
      stage.setPosition(x, 0, 0);
      makeSpirit(stage, sp ? spiritResPath(sp, 0) : '', ENEMY_SLOT.pic, sp?.icon ?? '❓', ENEMY_SLOT.picH).setPosition(0, 0, 0);
      makeLabel(enemyRow, sp?.name ?? '???', { fontSize: 18, color: COLORS.text }).setPosition(x, -ENEMY_SLOT.h / 2 - 14, 0);
    });
  };
  renderEnemies([]);

  // —— 我方编队 + 主角（两行三列，立绘尽量大）——
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

  // 槽位序号 → (x, y)：主角占 0 号，编队依次排 1..5，每行 3 个
  const allyPos = (idx: number): [number, number] => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    return [(col - 1) * ALLY_GAP, ALLY_ROW_Y[row]];
  };

  const team = s.team || [];

  // 主角卡（立绘：spirits/protagonist.png，设定=执笔育灵师·小椿；emoji 仅作加载兜底）
  const [hx, hy] = allyPos(0);
  const heroStage = makeSpiritStage(allyRow, ALLY_SLOT.w, ALLY_SLOT.h, '#7fc9a8');
  heroStage.setPosition(hx, hy, 0);
  makeSpirit(heroStage, 'spirits/protagonist', ALLY_SLOT.pic, '🌸', ALLY_SLOT.picH).setPosition(0, 0, 0);
  makeLabel(allyRow, '主角·小椿', { fontSize: 17, color: COLORS.text }).setPosition(hx, hy - ALLY_SLOT.h / 2 - 12, 0);
  slots['__hero'] = heroStage;

  team.forEach((id, i) => {
    const sp = SPIRIT_BY_ID[id];
    const [x, y] = allyPos(i + 1);
    const stage = makeSpiritStage(allyRow, ALLY_SLOT.w, ALLY_SLOT.h, sp ? (RARITY_COLOR[sp.rarity] ?? '#888888') : '#888888');
    stage.setPosition(x, y, 0);
    makeSpirit(stage, sp ? spiritResPath(sp, s.prog?.[id]?.evo ?? 0) : '', ALLY_SLOT.pic, sp?.icon ?? '❓', ALLY_SLOT.picH).setPosition(0, 0, 0);
    makeLabel(allyRow, sp?.name ?? '???', { fontSize: 17, color: COLORS.text }).setPosition(x, y - ALLY_SLOT.h / 2 - 12, 0);
    slots[id] = stage;
  });

  if (team.length === 0) {
    makeLabel(root, '尚未上阵精灵，主角独自挂机中…', { fontSize: 22, color: COLORS.sub }).setPosition(0, 120, 0);
  }

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
  ];
  nav.forEach(([label, key], i) => {
    makeButton(root, label, () => gm.go(key), { w: 166, h: 66, fontSize: 22 })
      .setPosition(-279 + i * 186, -430, 0);
  });

  // 离开本页时停止计时器，避免泄漏
  gm.cleanup = () => battle.stop();
}
