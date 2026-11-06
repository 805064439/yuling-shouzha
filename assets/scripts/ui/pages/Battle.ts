// 挂机战斗页（代码驱动 UI）—— 本游戏主界面
// 挂机游戏无开始按钮：进页即自动开战。展示我方编队+主角 与 敌方编队立绘。
// 每个上场单位（主角 / 精灵 / 每只怪）都有独立血条与血量数字；顶部总血条显示本关敌方总血量。
// 全部功能入口常驻本页底部导航条（编队/召唤/图鉴/商店/主角）。
// 视觉层 = 主页 UI 切图包 v1（暮色灵墨）：状态条/波次徽章/血条/金线/导航条均为切图，
// 白色填充图运行时染色；布局坐标按《主页UI切图包-v1/README.md》§1 坐标表。

import { Node, UITransform } from 'cc';
import type { GameManager } from '../GameManager';
import { Battle } from '../../logic/Battle';
import type { BattleEvent, Unit } from '../../logic/Battle';
import { SPIRIT_BY_ID, spiritResPath } from '../../logic/Spirits';
import type { EnemyDef } from '../../logic/Enemies';
import { enemyResPath } from '../../logic/Enemies';
import { RARITY_COLOR } from '../../logic/GameConfig';
import { stageForWave, isBossWave, isEliteWave } from '../../logic/Difficulty';
import {
  makeLabel, makeSpirit, makeSpiritStage, makePanel, setSize, setBg,
  makeUiSprite, tintUiSprite, attachClick, COLORS,
} from '../widgets';

const ENEMY_SLOT = { w: 170, h: 175, pic: 148, picH: 158 }; // 敌方立绘槽（3 只）
const ALLY_SLOT = { w: 180, h: 190, pic: 165, picH: 172 }; // 我方立绘槽（≥4 人两行网格时使用；≤3 人自适应放大）
const ALLY_ROW_Y = [105, -105]; // 我方两行的纵坐标

/** 梯队名 + 关底/教主标记（不含「第 N 波」前缀，波次由徽章显示） */
function tierLabel(wave: number): string {
  const mark = isBossWave(wave) ? ' 【教主】' : isEliteWave(wave) ? ' 【关底】' : '';
  return `${stageForWave(wave).name}${mark}`;
}

/** 总血条三态：普通暖红 / 精英橙 / 教主深红 */
function hpColor(wave: number): string {
  return isBossWave(wave) ? '#A8453F' : isEliteWave(wave) ? '#C9823F' : '#C96A5A';
}

interface UnitBar {
  update(u: Unit): void;
}

/** 在立绘舞台底部叠加一条独立血条 + 血量数字 + 倒下遮罩（单位血条切图版） */
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
  const bg = makeUiSprite(stage, 'ui_bar_unit_bg', barW, barH, '#141C1E');
  bg.name = 'unitHpBar'; // 端到端验证按此名字统计独立血条数量
  bg.setPosition(0, barY, 2);
  const fill = makeUiSprite(bg, 'ui_bar_unit_fill', barW, barH, '#FFFFFF');
  fill.name = 'unitHpFill';
  fill.setPosition(0, 0, 1);
  tintUiSprite(fill, color);

  // 血量数字必须坐深色胶囊：立绘有浅色大面，白字直接压上去会看不清
  const chip = makeUiSprite(stage, 'ui_chip_hp', 92, 26, COLORS.bg);
  chip.name = 'unitHpChip';
  chip.setPosition(0, barY + 24, 3);
  const num = makeLabel(chip, '', { fontSize: 14, color: COLORS.text });
  num.name = 'unitHpNum';
  setSize(num, 92, 20);
  num.setPosition(0, 0, 1);

  const mask = makeUiSprite(stage, 'ui_mask_dead', slotW - 20, 44, '#141C1E');
  mask.name = 'unitDeadMask';
  mask.setPosition(0, 0, 4);
  makeLabel(mask, deadText, { fontSize: 18, color: COLORS.text });
  mask.active = false;

  return {
    update(u: Unit) {
      const ratio = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0;
      const w = Math.max(1, ratio * barW);
      setSize(fill, w, barH);
      fill.setPosition((w - barW) / 2, 0, 1); // 左对齐：血条从左侧缩短
      tintUiSprite(fill, u.dead ? '#5A6660' : color);
      // 「已击败」只显示一处：死亡时隐藏血条位胶囊（含数字），保留卡片中央遮罩
      chip.active = !u.dead;
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

  // ① 顶部状态条：墨面 + 4 组「图标 + 金色数字」，灵气/灵核随每只击杀实时跳动
  const status = makeUiSprite(root, 'ui_panel_status', 710, 72, COLORS.panel);
  status.setPosition(0, 625, 0);
  const RES: Array<[string, () => string, string]> = [
    ['ui_icon_aura', () => `${Math.floor(s.gold)}`, '灵气'],
    ['ui_icon_core', () => `${s.cores || 0}`, '灵核'],
    ['ui_icon_ticket', () => `${s.tickets}`, '券'],
    ['ui_icon_wave', () => `${Math.max(1, s.bestWave || 1)}`, '最高波'],
  ];
  const resLabels: Node[] = [];
  makeLabel(status, `主角 Lv.${s.level}`, { fontSize: 22, color: COLORS.text })
    .setPosition(-270, 0, 1);
  RES.forEach(([icon, get, label], i) => {
    const x = -140 + i * 135;
    makeUiSprite(status, icon, 36, 36, COLORS.gold).setPosition(x - 34, 0, 1);
    const num = makeLabel(status, get(), { fontSize: 24, color: COLORS.gold });
    num.setPosition(x + 6, 0, 1);
    resLabels.push(num);
    makeLabel(status, label, { fontSize: 15, color: COLORS.sub }).setPosition(x + 6, -20, 1);
  });
  const refreshInfo = (): void => {
    RES.forEach(([, get], i) => {
      const n = resLabels[i];
      if (n && n.isValid) (n.getComponent('cc.Label') as any).string = get();
    });
  };
  refreshInfo();

  // ② 进度行：本关击杀 / 历史最高 / 挑战次数
  const progressLbl = makeLabel(root, '', { fontSize: 17, color: COLORS.sub });
  setSize(progressLbl, 660, 22);
  progressLbl.setPosition(0, 572, 0);

  // ③ 波次徽章（血条上方右偏，金色强调）
  const badge = makeUiSprite(root, 'ui_badge_wave', 200, 56, COLORS.bg);
  badge.setPosition(230, 540, 0);
  const waveLbl = makeLabel(badge, `第 ${startWave} 波`, { fontSize: 22, color: COLORS.gold });
  waveLbl.setPosition(0, 0, 1);

  // ④ 敌方总血条：墨面底槽 + 白色填充（运行时染三态）
  // fill 内缩 2px（616×36）：与 bg 造型贴合成一套，不再凸出底条边缘
  const hpBg = makeUiSprite(root, 'ui_bar_hp_bg', 620, 40, '#141C1E');
  hpBg.setPosition(0, 480, 0);
  const FILL_W = 616;
  const FILL_H = 36;
  const hpFill = makeUiSprite(hpBg, 'ui_bar_hp_fill', FILL_W, FILL_H, '#FFFFFF');
  hpFill.setPosition(0, 0, 1);
  tintUiSprite(hpFill, hpColor(startWave));
  const hpLbl = makeLabel(hpBg, `敌方 · ${tierLabel(startWave)}`, { fontSize: 20, color: COLORS.text });
  setSize(hpLbl, 620, 26);
  hpLbl.setPosition(0, 0, 2);

  // 金线分隔（普通 Sprite 横向拉伸，不做九宫格）
  makeUiSprite(root, 'ui_divider_gold', 620, 4, COLORS.gold).setPosition(0, 448, 0);
  makeLabel(root, '敌方编队 · 蚀灵教', { fontSize: 19, color: COLORS.sub }).setPosition(0, 432, 0);

  // —— 敌方编队（蚀灵教）：每只怪一张立绘 + 独立血条 ——
  const enemyRow = new Node('enemyRow');
  root.addChild(enemyRow);
  enemyRow.setPosition(0, 330, 0);
  const tierStageColor: Record<number, string> = {
    1: '#4A5D63', 2: '#5C5068', 3: '#6E4A55', 4: '#7A4050',
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
      const stage = makeSpiritStage(enemyRow, ENEMY_SLOT.w, ENEMY_SLOT.h, tierStageColor[e.tier] ?? '#4A5D63');
      stage.setPosition(x, 0, 0);
      makeSpirit(stage, enemyResPath(e.id), ENEMY_SLOT.pic, '❓', ENEMY_SLOT.picH).setPosition(0, 0, 0);
      enemyBars.push(makeUnitBar(stage, ENEMY_SLOT.w, ENEMY_SLOT.h, '#C96A5A', '已击败'));
      const tierTag = e.tier >= 4 ? '【教主】' : e.tier === 3 ? '【长老】' : '';
      makeLabel(enemyRow, tierTag + e.name, { fontSize: e.tier >= 3 ? 19 : 18, color: e.tier >= 3 ? COLORS.gold : COLORS.text })
        .setPosition(x, -ENEMY_SLOT.h / 2 - 14, 0);
    });
  };

  // —— 我方编队 + 主角（数量自适应：少则居中放大，多则两行网格）——
  // 小节标题样式：金色、上移避开敌方名签带（敌名 y≈228）
  makeLabel(root, '我方', { fontSize: 16, color: COLORS.gold }).setPosition(-320, 248, 0);
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
  const rowYs = singleRow ? [105] : ALLY_ROW_Y;
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
  const heroStage = makeSpiritStage(allyRow, SLOT.w, SLOT.h, '#5FAE57');
  heroStage.setPosition(hx, hy, 0);
  makeSpirit(heroStage, 'spirits/protagonist', SLOT.pic, '🌸', SLOT.picH).setPosition(0, 0, 0);
  allyBars.push(makeUnitBar(heroStage, SLOT.w, SLOT.h, '#5FAE57', '倒下'));
  makeLabel(allyRow, '主角·小椿', { fontSize: 17, color: COLORS.text }).setPosition(hx, hy - SLOT.h / 2 - nameGap, 0);
  slots['__hero'] = heroStage;

  team.forEach((id, i) => {
    const sp = SPIRIT_BY_ID[id];
    const [x, y] = allyPos(i + 1);
    const stage = makeSpiritStage(allyRow, SLOT.w, SLOT.h, sp ? (RARITY_COLOR[sp.rarity] ?? '#888888') : '#888888');
    stage.setPosition(x, y, 0);
    makeSpirit(stage, sp ? spiritResPath(sp, s.prog?.[id]?.evo ?? 0) : '', SLOT.pic, sp?.icon ?? '❓', SLOT.picH).setPosition(0, 0, 0);
    allyBars.push(makeUnitBar(stage, SLOT.w, SLOT.h, '#5FAE57', '倒下'));
    makeLabel(allyRow, sp?.name ?? '???', { fontSize: 17, color: COLORS.text }).setPosition(x, y - SLOT.h / 2 - nameGap, 0);
    slots[id] = stage;
  });

  // —— 战斗日志（墨面面板 + 金线收在面板顶内侧，文字从金线下方起排）——
  // 文本节点顶锚（anchorY=1）+ SHRINK：多行文字只向下生长且超行自动缩字号，
  // 彻底避免「金线横穿文字 / 文字溢出面板顶」。
  const logPanel = makePanel(root, { w: 660, h: 175, bg: COLORS.panel });
  logPanel.setPosition(0, -305, 0);
  makeUiSprite(logPanel, 'ui_divider_gold', 620, 4, COLORS.gold).setPosition(0, 76, 1);
  const logLabel = makeLabel(logPanel, `${tierLabel(startWave)} · 挂机战斗中…`, { fontSize: 18, color: COLORS.sub, wrapWidth: 620 });
  const logLab = logLabel.getComponent('cc.Label') as any;
  logLab.overflow = 2; // 2 = Overflow.SHRINK（web-mobile 构建不导出枚举，用数值）
  logLab.lineHeight = 27;
  setSize(logLabel, 620, 128);
  (logLabel.getComponent(UITransform) as any).anchorY = 1;
  logLabel.setPosition(0, 54, 1);
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
    // 顶部总血条（左对齐缩短）+ 关底/教主三态染色
    // 注意：比例钳制必须先于宽度放大——Math.max(1, ratio) 会让血条永远满格
    const ratio = Math.max(0, Math.min(1, ev.ratio));
    const w = Math.max(1, ratio * FILL_W);
    setSize(hpFill, w, FILL_H);
    hpFill.setPosition((w - FILL_W) / 2, 0, 1);
    const curWave = ev.wave ?? battle.wave;
    tintUiSprite(hpFill, hpColor(curWave));
    (waveLbl.getComponent('cc.Label') as any).string = `第 ${curWave} 波`;
    (hpLbl.getComponent('cc.Label') as any).string = `敌方 · ${tierLabel(curWave)}`;
    refreshInfo();
    refreshProgress(ev);
    bump(ev.attackerId ? slots[ev.attackerId] : slots['__hero']);
    if (ev.enemyChanged) renderEnemies(battle.enemyTeam);
    syncBars();
  };

  renderEnemies(battle.enemyTeam);
  refreshProgress();
  syncBars();
  battle.start(onTick);

  // ⑦ 底部导航条：切图按钮 + 描线图标，无 emoji
  const navBar = makeUiSprite(root, 'ui_nav_bar', 750, 140, COLORS.panel);
  navBar.setPosition(0, -560, 0);
  const NAV: Array<[string, string, string]> = [
    ['ui_nav_team', '编队', 'team'],
    ['ui_nav_gacha', '召唤', 'gacha'],
    ['ui_nav_dex', '图鉴', 'dex'],
    ['ui_nav_shop', '商店', 'shop'],
    ['ui_nav_hero', '主角', 'protagonist'],
  ];
  NAV.forEach(([icon, label, key], i) => {
    const x = -296 + i * 148;
    const active = gm.current === key;
    const btn = makeUiSprite(navBar, active ? 'ui_btn_nav_on' : 'ui_btn_nav_off', 132, 88, COLORS.panel);
    btn.name = 'btn'; // 与旧 makeButton 同名：端到端脚本按 name==='btn' 找导航
    btn.setPosition(x, 8, 1);
    makeUiSprite(btn, icon, 44, 44, active ? COLORS.gold : COLORS.text)
      .setPosition(0, 12, 2);
    makeLabel(btn, label, {
      fontSize: 18, color: active ? COLORS.gold : COLORS.text,
    }).setPosition(0, -26, 2);
    attachClick(btn, () => gm.go(key));
  });

  // 离开本页时停止计时器，避免泄漏
  gm.cleanup = () => battle.stop();
}
