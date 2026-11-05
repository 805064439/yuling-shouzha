// 挂机战斗页（代码驱动 UI）—— 本游戏主界面
// 挂机游戏无开始按钮：进页即自动开战。展示我方编队+主角 与 敌方编队立绘。
// 每个上场单位（主角 / 精灵 / 每只怪）都有独立血条与血量数字；顶部总血条显示本关敌方总血量。
// 全部功能入口常驻本页底部（编队/召唤/图鉴/商店/主角）。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { Battle } from '../../logic/Battle';
import type { BattleEvent, Unit } from '../../logic/Battle';
import { SPIRIT_BY_ID, spiritResPath } from '../../logic/Spirits';
import type { EnemyDef } from '../../logic/Enemies';
import { enemyResPath } from '../../logic/Enemies';
import { RARITY_COLOR } from '../../logic/GameConfig';
import { stageLabel, isBossWave, isEliteWave } from '../../logic/Difficulty';
import { makeLabel, makeButton, makePanel, makeSpirit, makeSpiritStage, setSize, setBg, COLORS } from '../widgets';

const ENEMY_SLOT = { w: 160, h: 175, pic: 148, picH: 158 }; // 敌方立绘槽（3 只）
const ALLY_SLOT = { w: 180, h: 205, pic: 165, picH: 182 }; // 我方立绘槽（≥4 人两行网格时使用；≤3 人自适应放大）
const ALLY_ROW_Y = [235, 5]; // 我方两行的纵坐标

interface UnitBar {
  update(u: Unit): void;
}

/** 在立绘舞台底部叠加一条独立血条 + 血量数字 + 倒下遮罩 */
function makeUnitBar(
  stage: Node,
  slotW: number,
  slotH: number,
  color: string,
  deadText: string,
): UnitBar {
  const barW = slotW - 24;
  const barH = 14;
  const barY = -slotH / 2 + 16;
  const bg = makePanel(stage, { w: barW, h: barH, bg: '#2a2028' });
  bg.name = 'unitHpBar'; // 端到端验证按此名字统计独立血条数量
  bg.setPosition(0, barY, 2);
  const fill = makePanel(bg, { w: barW, h: barH, bg: color });
  fill.name = 'unitHpFill';
  fill.setPosition(0, 0, 1);

  // 血量数字必须坐深色胶囊：立绘有浅色大面，白字直接压上去会看不清
  const chip = makePanel(stage, { w: 92, h: 26, bg: '#1b1622' });
  chip.name = 'unitHpChip';
  chip.setPosition(0, barY + 24, 3);
  const num = makeLabel(chip, '', { fontSize: 14, color: '#ffffff' });
  num.name = 'unitHpNum';
  setSize(num, 92, 20);
  num.setPosition(0, 0, 1);

  const mask = makePanel(stage, { w: slotW - 20, h: 44, bg: '#241b26' });
  mask.name = 'unitDeadMask';
  mask.setPosition(0, 0, 4);
  makeLabel(mask, deadText, { fontSize: 18, color: '#ffd9e2' });
  mask.active = false;

  return {
    update(u: Unit) {
      const ratio = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0;
      const w = Math.max(1, ratio * barW);
      setSize(fill, w, barH);
      fill.setPosition((w - barW) / 2, 0, 1); // 左对齐：血条从左侧缩短
      setBg(fill, u.dead ? '#4b4550' : color);
      (num.getComponent('cc.Label') as any).string = u.dead
        ? deadText
        : `${Math.max(0, Math.floor(u.hp))}/${u.maxHp}`;
      mask.active = u.dead;
    },
  };
}

export function buildBattle(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;
  const startWave = Math.max(1, Math.floor(s.wave || 1));

  // —— 战斗驱动（先建，UI 节点稍后挂日志接收器）——
  let logSink: ((msg: string) => void) | null = null;
  const battle = new Battle(s, (msg: string) => { if (logSink) logSink(msg); }, () => gm.save());

  // 顶部信息栏：灵气 / 灵核会随每只击杀实时跳动
  const info = makeLabel(root, '', { fontSize: 22, color: COLORS.text });
  setSize(info, 710, 30);
  info.setPosition(0, 628, 0);
  const refreshInfo = (): void => {
    (info.getComponent('cc.Label') as any).string =
      `主角 Lv.${s.level}　灵气 ${Math.floor(s.gold)}　灵核 ${s.cores || 0}　券 ${s.tickets}　最高 ${Math.max(1, s.bestWave || 1)} 波`;
  };
  refreshInfo();

  const progressLbl = makeLabel(root, '', { fontSize: 17, color: COLORS.sub });
  setSize(progressLbl, 660, 22);
  progressLbl.setPosition(0, 600, 0);

  // —— 顶部总血条（本关敌方全体剩余血量）——
  const hpBg = makePanel(root, { w: 620, h: 40, bg: '#3a2030' });
  hpBg.setPosition(0, 566, 0);
  const hpFill = makePanel(hpBg, { w: 620, h: 40, bg: '#e05a6f' });
  hpFill.setPosition(0, 0, 1);
  const hpLbl = makeLabel(hpBg, `敌方 · ${stageLabel(startWave)}`, { fontSize: 20, color: '#ffffff' });
  setSize(hpLbl, 620, 26);
  hpLbl.setPosition(0, 0, 2);

  // —— 敌方编队（蚀灵教）：每只怪一张立绘 + 独立血条 ——
  const enemyRow = new Node('enemyRow');
  root.addChild(enemyRow);
  enemyRow.setPosition(0, 455, 0);
  const tierStageColor: Record<number, string> = {
    1: '#5a5468', 2: '#6e4a68', 3: '#7a3e50', 4: '#8a3050',
  };
  let enemyBars: UnitBar[] = [];
  const renderEnemies = (team: EnemyDef[]): void => {
    enemyRow.removeAllChildren();
    enemyBars = [];
    const n = team.length;
    const gap = ENEMY_SLOT.w + 28;
    team.forEach((e, i) => {
      const x = (i - (n - 1) / 2) * gap;
      // 铁律：深底不放裸立绘 → 敌方立绘坐分层冷色纸舞台
      const stage = makeSpiritStage(enemyRow, ENEMY_SLOT.w, ENEMY_SLOT.h, tierStageColor[e.tier] ?? '#5a5468');
      stage.setPosition(x, 0, 0);
      makeSpirit(stage, enemyResPath(e.id), ENEMY_SLOT.pic, '❓', ENEMY_SLOT.picH).setPosition(0, 0, 0);
      enemyBars.push(makeUnitBar(stage, ENEMY_SLOT.w, ENEMY_SLOT.h, '#e05a6f', '已击败'));
      const tierTag = e.tier >= 4 ? '【教主】' : e.tier === 3 ? '【长老】' : '';
      makeLabel(enemyRow, tierTag + e.name, { fontSize: e.tier >= 3 ? 19 : 18, color: e.tier >= 3 ? '#e8b0bc' : COLORS.text })
        .setPosition(x, -ENEMY_SLOT.h / 2 - 14, 0);
    });
  };

  // —— 我方编队 + 主角（数量自适应：少则居中放大，多则两行网格）——
  makeLabel(root, '我方', { fontSize: 20, color: COLORS.sub }).setPosition(-320, 345, 0);
  const allyRow = new Node('allyRow');
  root.addChild(allyRow);
  allyRow.setPosition(0, 0, 0);

  const slots: Record<string, Node> = {}; // attackerId → 立绘节点（出手高亮）
  const bump = (n: Node | undefined): void => {
    if (!n || !n.isValid) return;
    n.setScale(1.18, 1.18, 1);
    setTimeout(() => { if (n.isValid) n.setScale(1, 1, 1); }, 380);
  };

  const team = s.team || [];
  const count = team.length + 1; // 主角 + 编队
  const SLOT = count === 1
    ? { w: 300, h: 330, pic: 280, picH: 305 }
    : count === 2
      ? { w: 250, h: 270, pic: 230, picH: 250 }
      : count === 3
        ? { w: 210, h: 230, pic: 190, picH: 210 }
        : ALLY_SLOT;
  const singleRow = count <= 3;
  const perRow = singleRow ? count : Math.ceil(count / 2);
  const rowYs = singleRow ? [110] : ALLY_ROW_Y;
  const rowCounts = singleRow ? [count] : [perRow, count - perRow];
  const gapX = SLOT.w + 20;

  const allyPos = (idx: number): [number, number] => {
    const r = Math.min(Math.floor(idx / perRow), rowYs.length - 1);
    const c = idx - r * perRow;
    return [(c - (rowCounts[r] - 1) / 2) * gapX, rowYs[r]];
  };

  const allyBars: UnitBar[] = [];
  // 单行布局的立绘槽会放大到 330px，名字标签自带 ~50px 文本框，
  // 仍用 12px 间距会顶到底部血条；两行布局则必须保持 12px 才不压到下一排。
  const nameGap = singleRow ? 30 : 12;
  // 主角卡（立绘：spirits/protagonist.png，设定=执笔育灵师·小椿）
  const [hx, hy] = allyPos(0);
  const heroStage = makeSpiritStage(allyRow, SLOT.w, SLOT.h, '#7fc9a8');
  heroStage.setPosition(hx, hy, 0);
  makeSpirit(heroStage, 'spirits/protagonist', SLOT.pic, '🌸', SLOT.picH).setPosition(0, 0, 0);
  allyBars.push(makeUnitBar(heroStage, SLOT.w, SLOT.h, '#6fd6a0', '倒下'));
  makeLabel(allyRow, '主角·小椿', { fontSize: 17, color: COLORS.text }).setPosition(hx, hy - SLOT.h / 2 - nameGap, 0);
  slots['__hero'] = heroStage;

  team.forEach((id, i) => {
    const sp = SPIRIT_BY_ID[id];
    const [x, y] = allyPos(i + 1);
    const stage = makeSpiritStage(allyRow, SLOT.w, SLOT.h, sp ? (RARITY_COLOR[sp.rarity] ?? '#888888') : '#888888');
    stage.setPosition(x, y, 0);
    makeSpirit(stage, sp ? spiritResPath(sp, s.prog?.[id]?.evo ?? 0) : '', SLOT.pic, sp?.icon ?? '❓', SLOT.picH).setPosition(0, 0, 0);
    allyBars.push(makeUnitBar(stage, SLOT.w, SLOT.h, '#6fd6a0', '倒下'));
    makeLabel(allyRow, sp?.name ?? '???', { fontSize: 17, color: COLORS.text }).setPosition(x, y - SLOT.h / 2 - nameGap, 0);
    slots[id] = stage;
  });

  // —— 战斗日志 ——
  const logPanel = makePanel(root, { w: 660, h: 175, bg: COLORS.panel });
  logPanel.setPosition(0, -235, 0);
  const logLabel = makeLabel(logPanel, `${stageLabel(startWave)} · 挂机战斗中…`, { fontSize: 20, color: COLORS.sub, wrapWidth: 620 });
  logLabel.setPosition(0, 0, 0);
  logSink = (msg: string) => {
    const cur = (logLabel.getComponent('cc.Label') as any).string || '';
    const lines = cur.split('\n').filter(Boolean);
    lines.push(msg);
    (logLabel.getComponent('cc.Label') as any).string = lines.slice(-5).join('\n');
  };

  const refreshProgress = (ev?: BattleEvent): void => {
    const kills = ev && ev.kills !== undefined ? ev.kills : battle.kills;
    const total = battle.enemies.length;
    (progressLbl.getComponent('cc.Label') as any).string =
      `本关击杀 ${kills}/${total}　历史最高 ${Math.max(1, s.bestWave || 1)} 波　第 ${battle.attempts + 1} 次挑战`;
  };

  const syncBars = (): void => {
    battle.enemies.forEach((u, i) => { if (enemyBars[i]) enemyBars[i].update(u); });
    battle.allies.forEach((u, i) => { if (allyBars[i]) allyBars[i].update(u); });
  };

  const onTick = (ev: BattleEvent) => {
    // 顶部总血条（左对齐缩短）+ 关底/教主配色
    const w = Math.max(1, Math.min(1, ev.ratio)) * 620;
    setSize(hpFill, w, 40);
    hpFill.setPosition((w - 620) / 2, 0, 1);
    const curWave = ev.wave ?? battle.wave;
    setBg(hpFill, isBossWave(curWave) ? '#c8324b'
      : isEliteWave(curWave) ? '#d97a3c' : '#e05a6f');
    (hpLbl.getComponent('cc.Label') as any).string = `敌方 · ${stageLabel(curWave)}`;
    refreshInfo();
    refreshProgress(ev);
    bump(ev.attackerId ? slots[ev.attackerId] : slots['__hero']);
    if (ev.enemyChanged) renderEnemies(battle.enemyTeam);
    syncBars();
  };

  renderEnemies(battle.enemyTeam);
  setBg(hpFill, isBossWave(startWave) ? '#c8324b' : isEliteWave(startWave) ? '#d97a3c' : '#e05a6f');
  refreshProgress();
  syncBars();
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
