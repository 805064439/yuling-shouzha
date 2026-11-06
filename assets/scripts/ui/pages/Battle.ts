// 挂机战斗页（代码驱动 UI）—— 本游戏主界面
// 挂机游戏无开始按钮：进页即自动开战。展示我方编队+主角 与 敌方编队立绘。
// 每个上场单位（主角 / 精灵 / 每只怪）都有独立血条与血量数字；顶部总血条显示本关敌方总血量。
// 全部功能入口常驻本页底部导航条（编队/召唤/图鉴/商店/主角）。
// 视觉层 = ui3 翡翠仙境切图包 v1（绿底金框卡牌体系，tools/jade/README.md）：
// 背景/状态栏/珊瑚横幅/波次徽章/金框卡/血条三色/名牌/导航按钮均为切图，
// 三色血条用切图直选（red=敌/普怪、gold=精英/教主、green=我方），不再运行时染色。

import { Node, UITransform } from 'cc';
import type { GameManager } from '../GameManager';
import { Battle } from '../../logic/Battle';
import type { BattleEvent, Unit } from '../../logic/Battle';
import { SPIRIT_BY_ID, spiritResPath } from '../../logic/Spirits';
import type { EnemyDef } from '../../logic/Enemies';
import { enemyResPath } from '../../logic/Enemies';
import { stageForWave, isBossWave, isEliteWave } from '../../logic/Difficulty';
import {
  makeLabel, makeSpirit, setSize, setBg,
  makeUiSprite, makeUi3Sprite, attachClick,
} from '../widgets';

// 金框卡牌内窗（frame_spirit_card 197×254，内窗 x11-186 y11-197）
const ENEMY_CARD = { w: 186, h: 240, pic: 152, picH: 162 }; // 敌方 3 卡
const HERO_CARD = { w: 240, h: 310, pic: 200, picH: 214 };  // count=1 主角大卡（设计意图）
const CARD_2 = { w: 210, h: 271, pic: 172, picH: 185 };
const CARD_3 = { w: 186, h: 240, pic: 152, picH: 162 };
const ALLY_CARD = { w: 186, h: 240, pic: 152, picH: 162 };  // ≥4 两行网格
const ALLY_ROW_Y = [140, -110]; // 我方两行的纵坐标（单行时动态求安全位）

/** 翡翠色板（README §4 文字规范） */
const JADE = {
  goldText: '#E8C87E',   // 状态栏数值 / 导航 label / 波次
  chipNum: '#EFDFA8',    // 胶囊数值
  body: '#F0EAD6',       // 面板正文（米白）
  namePlate: '#5E705A',  // 名牌文字（墨绿）
  sub: '#C2D0BC',        // 次要信息（进度行/标签）
};

/** 梯队名 + 关底/教主标记（不含「第 N 波」前缀，波次由徽章显示） */
function tierLabel(wave: number): string {
  const mark = isBossWave(wave) ? ' 【教主】' : isEliteWave(wave) ? ' 【关底】' : '';
  return `${stageForWave(wave).name}${mark}`;
}

/** 血条三色语义：普通=红、精英/关底/教主=金（README §5.7 勿混搭） */
function barFillName(wave: number): string {
  return isBossWave(wave) || isEliteWave(wave) ? 'bar_fill_gold' : 'bar_fill_red';
}

interface UnitBar {
  update(u: Unit): void;
}

/**
 * 金框卡牌：frame_spirit_card（内窗打孔，立绘放内窗）+ 三件套
 * chip_hp（数字胶囊，卡内下部）/ bar_fill（进度条）/ plate_name（金缎带名牌，卡底舌位）
 * + 死亡遮罩（沿用旧 ui_mask_dead）。节点名保留 unitHp* 供端到端探针统计。
 */
function makeUnitBar(
  stage: Node,
  cardW: number,
  cardH: number,
  color: 'red' | 'gold' | 'green',
  unitName: string,
  deadText: string,
): UnitBar {
  const k = cardH / 240; // 卡内组件坐标按 186×240 基准等比换算
  // ① 立绘内窗：中心在卡中心上方 ~22k，立绘由外部 makeSpirit 放入
  // ② 血量数字胶囊
  const chipW = Math.min(118 * k, cardW - 44);
  const chip = makeUi3Sprite(stage, `chip_hp_${color}`, chipW, 24);
  chip.name = 'unitHpChip';
  chip.setPosition(0, -72 * k, 3);
  const num = makeLabel(chip, '', { fontSize: 14, color: JADE.chipNum });
  num.name = 'unitHpNum';
  setSize(num, chipW - 8, 20);
  num.setPosition(0, 0, 1);
  // ③ 进度条（fill 即条，参考图无底槽；残血右侧留空）
  const barW = Math.min(132 * k, cardW - 44);
  const innerW = barW - 4; // fill 内缩 2px×2
  const fill = makeUi3Sprite(stage, `bar_fill_${color}`, barW, 14);
  fill.name = 'unitHpFill';
  fill.setPosition(0, -88 * k, 2); // update 时按 ratio 左对齐重算
  // ④ 名牌缎带（卡底舌位，与 fill 留 3px 空隙防相切）
  const plateW = Math.min(148 * k, cardW - 24);
  const plate = makeUi3Sprite(stage, 'plate_name_gold', plateW, 22);
  plate.setPosition(0, -109 * k, 3);
  const nameLbl = makeLabel(plate, unitName, { fontSize: plateW > 120 ? 15 : 13, color: JADE.namePlate });
  setSize(nameLbl, plateW - 30, 18);
  nameLbl.setPosition(0, 0, 1);
  // ⑤ 死亡遮罩（旧 ui/ 切图：卡片中央红描边「已击败/倒下」）
  const mask = makeUiSprite(stage, 'ui_mask_dead', slotSafeW(cardW), 44, '#141C1E');
  mask.name = 'unitDeadMask';
  mask.setPosition(0, 0, 4);
  mask.active = false;

  return {
    update(u: Unit) {
      const ratio = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0;
      const w = Math.max(1, ratio * innerW);
      setSize(fill, w, 14); // 高度恒 14，只变宽
      fill.setPosition(-innerW / 2 + w / 2, -88 * k, 2); // 左对齐：居中锚点公式
      fill.active = !u.dead;
      chip.active = !u.dead; // 「已击败」只显示一处：死亡隐藏胶囊与条，保留中央遮罩
      (num.getComponent('cc.Label') as any).string = u.dead
        ? deadText
        : `${Math.max(0, Math.floor(u.hp))}/${u.maxHp}`;
      mask.active = u.dead;
    },
  };
}

function slotSafeW(cardW: number): number {
  return Math.min(cardW - 36, 220);
}

export function buildBattle(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;
  const startWave = Math.max(1, Math.floor(s.wave || 1));

  // —— 战斗驱动（先建，UI 节点稍后挂日志接收器）——
  let logSink: ((msg: string) => void) | null = null;
  const battle = new Battle(s, (msg: string) => { if (logSink) logSink(msg); }, () => gm.save());

  // ⓪ 背景：翡翠仙境山水（750×1334 整图铺底，最先添加 = 最底层）
  // 注意：不加额外装饰件——背景与 panel_status 两端已自带莲花/云纹，再叠会互相压。
  const bg = makeUi3Sprite(root, 'bg_spirit_realm_main', 750, 1334);
  bg.setPosition(0, 0, 0);

  // ① 顶部状态条：panel_status（两端莲花端饰，只横向拉伸）
  // 四组货币 = 「图标 + 金色数字」单行（对齐仿真图；状态栏高 70 塞不下三层）
  const status = makeUi3Sprite(root, 'panel_status', 729, 70);
  status.setPosition(0, 622, 0);
  const RES: Array<[string, () => string]> = [
    ['icon_stone', () => `${Math.floor(s.gold)}`],
    ['icon_jade', () => `${s.cores || 0}`],
    ['icon_talisman', () => `${s.tickets}`],
    ['icon_moon', () => `${Math.max(1, s.bestWave || 1)}`],
  ];
  const resLabels: Node[] = [];
  // 端饰避让：panel_status 两端莲花端饰区约 70px 宽，内容须收在 ±294 内
  makeLabel(status, `主角 Lv.${s.level}`, { fontSize: 21, color: JADE.goldText })
    .setPosition(-210, 0, 1);
  RES.forEach(([icon, get], i) => {
    const x = -116 + i * 124;
    makeUi3Sprite(status, icon, 28, 33).setPosition(x - 26, 0, 1);
    const num = makeLabel(status, get(), { fontSize: 20, color: JADE.goldText });
    num.setPosition(x + 16, 0, 1);
    resLabels.push(num);
  });
  const refreshInfo = (): void => {
    RES.forEach(([, get], i) => {
      const n = resLabels[i];
      if (n && n.isValid) (n.getComponent('cc.Label') as any).string = get();
    });
  };
  refreshInfo();

  // ② 进度行
  const progressLbl = makeLabel(root, '', { fontSize: 17, color: JADE.sub });
  setSize(progressLbl, 660, 22);
  progressLbl.setPosition(-40, 575, 0);

  // ③ 波次徽章（button_wave，文字已清空由程序绘）
  const badge = makeUi3Sprite(root, 'button_wave', 220, 58);
  badge.setPosition(230, 540, 0);
  const waveLbl = makeLabel(badge, `第 ${startWave} 波`, { fontSize: 22, color: JADE.goldText });
  waveLbl.setPosition(0, 0, 1);

  // ④ 敌方总血条：chip_hp_red 深胶囊做底槽 + bar_fill 三色切换（普通红/精英教主金）
  // fill 内缩：612×28（bg 620×40），高度恒定只按 ratio 变宽、左对齐
  const HPBG_W = 620;
  const HP_INNER_W = 612;
  const HP_INNER_H = 28;
  const hpBg = makeUi3Sprite(root, 'chip_hp_red', HPBG_W, 40);
  hpBg.name = 'ui_bar_hp_bg'; // 端到端探针兼容
  hpBg.setPosition(0, 495, 0);
  const hpFillR = makeUi3Sprite(hpBg, 'bar_fill_red', HP_INNER_W, HP_INNER_H);
  hpFillR.name = 'ui_bar_hp_fill';
  const hpFillG = makeUi3Sprite(hpBg, 'bar_fill_gold', HP_INNER_W, HP_INNER_H);
  hpFillG.name = 'ui_bar_hp_fill_gold';
  hpFillG.active = false;
  const hpLbl = makeLabel(hpBg, `敌方 · ${tierLabel(startWave)}`, { fontSize: 17, color: '#FFF8E8' });
  setSize(hpLbl, HPBG_W - 40, 22);
  hpLbl.setPosition(0, 0, 2);

  // ⑤ 敌方标题：panel_title_coral 红珊瑚横幅（内含莲花徽记）
  const titleBanner = makeUi3Sprite(root, 'panel_title_coral', 560, 46);
  titleBanner.setPosition(0, 448, 0);
  makeLabel(titleBanner, '敌方编队 · 蚀灵教', { fontSize: 20, color: '#FFF0DC' })
    .setPosition(0, 0, 1);

  // —— 敌方编队（蚀灵教）：每只怪一张金框卡 ——
  const enemyRow = new Node('enemyRow');
  root.addChild(enemyRow);
  enemyRow.setPosition(0, 320, 0);
  const enemySlots: Node[] = []; // 敌方出手高亮用（下标 = 敌方编队下标）
  let enemyBars: UnitBar[] = [];
  const renderEnemies = (team: EnemyDef[]): void => {
    enemyRow.removeAllChildren();
    enemyBars = [];
    enemySlots.length = 0;
    const n = team.length;
    const gap = ENEMY_CARD.w + 22; // §2：3 列卡牌，列间距 ~22
    team.forEach((e, i) => {
      const x = (i - (n - 1) / 2) * gap;
      const card = makeUi3Sprite(enemyRow, 'frame_spirit_card', ENEMY_CARD.w, ENEMY_CARD.h);
      card.setPosition(x, 0, 0);
      // 立绘放内窗（内窗中心在卡中心上方 ~22px），不染卡框（会连金边一起染）
      makeSpirit(card, enemyResPath(e.id), ENEMY_CARD.pic, '❓', ENEMY_CARD.picH).setPosition(0, 22, 0);
      // 三色语义：长老/教主 gold，普通 red
      const color: 'red' | 'gold' = e.tier >= 3 ? 'gold' : 'red';
      enemyBars.push(makeUnitBar(card, ENEMY_CARD.w, ENEMY_CARD.h, color, e.name, '已击败'));
      enemySlots.push(card);
    });
  };

  // —— 我方编队 + 主角（数量自适应：少则居中放大，多则两行网格）——
  const allyRow = new Node('allyRow');
  root.addChild(allyRow);
  allyRow.setPosition(0, 0, 0);

  const slots: Record<string, Node> = {}; // attackerId → 立绘节点（出手高亮）
  const bump = (n: Node | undefined): void => {
    if (!n || !n.isValid) return;
    n.setScale(1.15, 1.15, 1);
    setTimeout(() => { if (n.isValid) n.setScale(1, 1, 1); }, 380);
  };

  const team = s.team || [];
  const count = team.length + 1; // 主角 + 编队
  const SLOT = count === 1 ? HERO_CARD : count === 2 ? CARD_2 : CARD_3;
  const singleRow = count <= 3;
  const perRow = singleRow ? count : Math.ceil(count / 2);
  // 单行布局：卡顶不得超过敌方卡行下沿（敌卡底 = 320 - 120 = 200，留 16px 余量），
  // 否则主角大卡会压住敌方卡牌（R3 确认 bug 的同款约束）。
  const ALLY_TOP_SAFE = 184;
  const rowYs = singleRow ? [ALLY_TOP_SAFE - SLOT.h / 2] : ALLY_ROW_Y;
  const rowCounts = singleRow ? [count] : [perRow, count - perRow];
  const gapX = SLOT.w + 22;
  // 小节标题「我方」：金色、与我方第一行垂直居中
  makeLabel(root, '我方', { fontSize: 16, color: JADE.goldText }).setPosition(-330, rowYs[0], 0);

  const allyPos = (idx: number): [number, number] => {
    const r = Math.min(Math.floor(idx / perRow), rowYs.length - 1);
    const c = idx - r * perRow;
    return [(c - (rowCounts[r] - 1) / 2) * gapX, rowYs[r]];
  };

  const allyBars: UnitBar[] = [];
  // 主角卡（立绘：spirits/protagonist.png，设定=执笔育灵师·小椿）
  const [hx, hy] = allyPos(0);
  const heroCard = makeUi3Sprite(allyRow, 'frame_spirit_card', SLOT.w, SLOT.h);
  heroCard.setPosition(hx, hy, 0);
  makeSpirit(heroCard, 'spirits/protagonist', SLOT.pic, '🌸', SLOT.picH).setPosition(0, 22 * (SLOT.h / 240), 0);
  allyBars.push(makeUnitBar(heroCard, SLOT.w, SLOT.h, 'green', '主角·小椿', '倒下'));
  slots['__hero'] = heroCard;

  team.forEach((id, i) => {
    const sp = SPIRIT_BY_ID[id];
    const [x, y] = allyPos(i + 1);
    const card = makeUi3Sprite(allyRow, 'frame_spirit_card', SLOT.w, SLOT.h);
    card.setPosition(x, y, 0);
    makeSpirit(card, sp ? spiritResPath(sp, s.prog?.[id]?.evo ?? 0) : '', SLOT.pic, sp?.icon ?? '❓', SLOT.picH)
      .setPosition(0, 22 * (SLOT.h / 240), 0);
    allyBars.push(makeUnitBar(card, SLOT.w, SLOT.h, 'green', sp?.name ?? '???', '倒下'));
    slots[id] = card;
  });

  // —— 战斗日志：panel_jade_large 深绿云纹大面板（自带金双边框）——
  // 文字顶锚（anchorY=1）+ SHRINK：多行只向下生长且超行自动缩字号
  const logPanel = makeUi3Sprite(root, 'panel_jade_large', 660, 160);
  logPanel.setPosition(0, -320, 0);
  const logLabel = makeLabel(logPanel, `${tierLabel(startWave)} · 挂机战斗中…`, { fontSize: 18, color: JADE.body, wrapWidth: 600 });
  const logLab = logLabel.getComponent('cc.Label') as any;
  logLab.overflow = 2; // 2 = Overflow.SHRINK（web-mobile 构建不导出枚举，用数值）
  logLab.lineHeight = 27;
  setSize(logLabel, 600, 118);
  (logLabel.getComponent(UITransform) as any).anchorY = 1;
  logLabel.setPosition(0, 62, 1);
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

  const setTotalHp = (ratio: number, wave: number): void => {
    const w = Math.max(1, Math.min(1, ratio) * HP_INNER_W);
    const gold = barFillName(wave) === 'bar_fill_gold';
    for (const f of [hpFillR, hpFillG]) {
      setSize(f, w, HP_INNER_H);
      f.setPosition(-HP_INNER_W / 2 + w / 2, 0, 1); // 左对齐：居中锚点公式
    }
    hpFillR.active = !gold;
    hpFillG.active = gold;
  };

  const onTick = (ev: BattleEvent) => {
    const curWave = ev.wave ?? battle.wave;
    setTotalHp(ev.ratio, curWave);
    (waveLbl.getComponent('cc.Label') as any).string = `第 ${curWave} 波`;
    (hpLbl.getComponent('cc.Label') as any).string = `敌方 · ${tierLabel(curWave)}`;
    refreshInfo();
    refreshProgress(ev);
    // 步进制演出：每次 tick 只有一次攻击——出手方立绘放大高亮一下，
    // 被击中的目标由 syncBars 立即刷新血条/「已击败」遮罩
    if (ev.attackerSide === 'enemy' && ev.attackerIndex !== undefined) {
      bump(enemySlots[ev.attackerIndex]);
    } else {
      bump(ev.attackerId ? slots[ev.attackerId] : slots['__hero']);
    }
    if (ev.enemyChanged) renderEnemies(battle.enemyTeam);
    syncBars();
  };

  renderEnemies(battle.enemyTeam);
  refreshProgress();
  syncBars();
  setTotalHp(battle.enemyRatio(), battle.wave);
  battle.start(onTick);

  // ⑦ 底部导航：button_nav_* 五枚（图标保留、文字清空由程序绘 label）
  const NAV: Array<[string, string, string]> = [
    ['button_nav_team', '编队', 'team'],
    ['button_nav_gacha', '召唤', 'gacha'],
    ['button_nav_dex', '图鉴', 'dex'],
    ['button_nav_shop', '商店', 'shop'],
    ['button_nav_hero', '主角', 'protagonist'],
  ];
  NAV.forEach(([icon, label, key], i) => {
    const x = -296 + i * 148;
    const active = gm.current === key;
    const btn = makeUi3Sprite(root, icon, 148, 77);
    btn.name = 'btn'; // 与旧 makeButton 同名：端到端脚本按 name==='btn' 找导航
    btn.setPosition(x, -560, 0);
    if (active) btn.setScale(1.06, 1.06, 1); // 当前页：按钮微放大 + label 金色
    makeLabel(btn, label, {
      fontSize: 16, color: active ? JADE.goldText : JADE.sub,
    }).setPosition(0, -18, 1);
    attachClick(btn, () => gm.go(key));
  });

  // 离开本页时停止计时器，避免泄漏
  gm.cleanup = () => battle.stop();
}
