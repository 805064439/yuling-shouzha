// 挂机战斗页（代码驱动 UI）—— 本游戏主界面
// 挂机游戏无开始按钮：进页即自动开战。展示我方编队+主角 与 敌方编队立绘。
// 每个上场单位（主角 / 精灵 / 每只怪）都有独立血条与血量数字；顶部总血条显示本关敌方总血量。
// 全部功能入口常驻本页底部导航条（编队/召唤/图鉴/商店/主角）。
// 视觉层 = ui3 翡翠仙境切图包 v1（绿底金框卡牌体系，tools/jade/README.md）：
// 背景/状态栏/波次徽章/总血条/金框卡/血条三色/名牌/导航按钮均为切图，
// 三色血条用切图直选（red=敌/普怪、gold=精英/教主、green=我方），不再运行时染色。
// R1（翡翠包真机验收）修正：
//  · 立绘窗口 = 金框内窗（frame_spirit_card 内窗 x11-186 y11-197），中心偏上 22，clip 硬裁剪兜底；
//  · 单位血条三件套按色系直选（chip_hp_*/bar_fill_*/plate_name_*），渲染高=源高防端头压缩；
//  · 敌方总血条 = panel_section_jade 620×44（实心深绿槽，fill 22 高居中）；
//  · 卡内窗垫 card_plate_cloud 染稀有度/梯队色（alpha 150），金框本身绝不染色。

import { Node, UITransform, Graphics, Color, tween } from 'cc';
import type { GameManager } from '../GameManager';
import { Battle } from '../../logic/Battle';
import type { BattleEvent, Unit } from '../../logic/Battle';
import { SPIRIT_BY_ID, spiritResPath } from '../../logic/Spirits';
import type { EnemyDef } from '../../logic/Enemies';
import { enemyResPath } from '../../logic/Enemies';
import { stageForWave, isBossWave, isEliteWave } from '../../logic/Difficulty';
import { RARITY_COLOR } from '../../logic/GameConfig';
import {
  makeLabel, makeSpirit, setSize, newNode, hexToColor,
  makeUi3Sprite, tintUiSprite, attachClick,
} from '../widgets';

// 金框卡牌（frame_spirit_card 197×254 等比缩放；立绘窗口 = 内窗 165×176，中心偏上 22）
// R2 P1-3：两排网格卡缩至 164×211（k=0.88）+ 敌行上移 320→338（敌卡底 218），
// 排1 顶 209 与敌名牌底间隙 9、排2 底 -234 与日志顶间隙 6——纵向满排布且与敌区零重叠。
const ENEMY_CARD = { w: 186, h: 240 }; // 敌方 3 卡
const HERO_CARD = { w: 240, h: 310 };  // count=1 主角大卡（设计意图）
const CARD_2 = { w: 210, h: 271 };
const CARD_3 = { w: 164, h: 211 };
const ALLY_CARD = { w: 164, h: 211 };  // ≥4 两行网格
const ALLY_ROW_Y = [104, -129]; // 排1 [−1.5,209] 排2 [−234.5,−23.5]，排间隙 22 设计px
/** 内窗尺寸/中心（以 240 高卡为基准，按 cardH/240 等比换算） */
const INNER = { w: 158, h: 176, cy: -22 };

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

/** 敌方垫底色（与 EnemyDetail.TIER_STAGE 一致；key = EnemyDef.tier） */
const TIER_STAGE: Record<number, string> = {
  1: '#5a5468', 2: '#6e4a68', 3: '#7a3e50', 4: '#8a3050',
};

interface UnitBar {
  update(u: Unit): void;
}

/**
 * 金框卡牌单位血条三件套（R1 验收 P0-2 重构）：
 *  · chip_hp_{color} 血量数字胶囊：渲染高 = 源高×k（≥1 只拉伸不压缩，端头不变形）；
 *  · bar_fill_{color} 进度条：恒高、只按 ratio 变宽、左对齐，fill 顶/底各藏入相邻件 ~2px；
 *  · plate_name_{color} 名牌缎带：卡底舌位，怪名上移进名牌内（不再被卡框挡住）。
 * 240 高卡纵向布局（y 自上而下）：chip -62(28) → fill -85(21) → plate -107(26)=贴卡底。
 * z 序：fill(1) < plate(2) < chip(3) < 死亡遮罩(4)。节点名保留 unitHp* 供端到端探针统计。
 */
const UNIT_CHIP_H = 28;   // chip_hp_* 源高（red 132×28 / green 125×30 / gold 119×28）
const UNIT_FILL_H: Record<'red' | 'gold' | 'green', number> = { red: 21, gold: 21, green: 19 };
const UNIT_PLATE_H = 26;  // 名牌渲染高（源 32 压 0.81，竖 cap 20 ≤ 26 合法）

function makeUnitBar(
  stage: Node,
  cardW: number,
  cardH: number,
  color: 'red' | 'gold' | 'green',
  unitName: string,
  deadText: string,
): UnitBar {
  const k = cardH / 240; // 卡内组件坐标按 186×240 基准等比换算
  // ② 血量数字胶囊（渲染高 = 源高×k，k≥1 只拉伸，端头安全）
  const chipW = Math.min(132 * k, cardW - 36);
  const chipH = UNIT_CHIP_H * k;
  const chip = makeUi3Sprite(stage, `chip_hp_${color}`, chipW, chipH);
  chip.name = 'unitHpChip';
  chip.setPosition(0, -62 * k, 3);
  const num = makeLabel(chip, '', { fontSize: Math.max(14, Math.round(16 * k)), color: JADE.chipNum });
  num.name = 'unitHpNum';
  setSize(num, chipW - 14, chipH - 4);
  num.setPosition(0, 0, 1);
  // ③ 进度条（fill 即条，参考图无底槽；残血右侧留空）
  const fillH = UNIT_FILL_H[color] * k;
  const barW = Math.min(132 * k, cardW - 44);
  const innerW = barW - 4; // fill 内缩 2px×2
  const fill = makeUi3Sprite(stage, `bar_fill_${color}`, barW, fillH);
  fill.name = 'unitHpFill';
  fill.setPosition(0, -85 * k, 1); // z=1 最底：顶藏入胶囊后、底藏入名牌后
  // ④ 名牌缎带（卡底舌位，底缘贴卡底；怪名移进名牌内）
  const plateW = Math.min(206 * k, cardW - 20);
  const plate = makeUi3Sprite(stage, `plate_name_${color}`, plateW, UNIT_PLATE_H * k);
  plate.setPosition(0, -107 * k, 2);
  const nameLbl = makeLabel(plate, unitName, { fontSize: Math.max(13, Math.round(15 * k)), color: JADE.namePlate });
  setSize(nameLbl, plateW - 34, UNIT_PLATE_H * k - 8);
  nameLbl.setPosition(0, 0, 1);
  // ⑤ 死亡遮罩（R2 P0-1 重做：弃旧 ui_mask_dead 黑块——纯 Graphics 深绿半透明+金描边，
  // 节点永不为 Sprite，不触发「先 Graphics 后 Sprite 永不渲染」陷阱；文字「已击败/倒下」补回）
  const mask = newNode('unitDeadMask', stage);
  const mw = slotSafeW(cardW);
  setSize(mask, mw, 44);
  mask.setPosition(0, 0, 4);
  const mg = mask.addComponent(Graphics);
  mg.fillColor = new Color(30, 42, 46, 200); // #1E2A2E alpha 200，米白文字对比 ≈9:1
  mg.roundRect(-mw / 2, -22, mw, 44, 12);
  mg.fill();
  mg.lineWidth = 3;
  mg.strokeColor = hexToColor(JADE.goldText);
  mg.roundRect(-mw / 2 + 1.5, -20.5, mw - 3, 41, 11);
  mg.stroke();
  const deadLbl = makeLabel(mask, deadText, { fontSize: 20, color: '#FFF8E8' });
  deadLbl.setPosition(0, 0, 1);
  mask.active = false;

  return {
    update(u: Unit) {
      const ratio = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0;
      const w = Math.max(1, ratio * innerW);
      setSize(fill, w, fillH); // 高度恒 = 源高×k，只变宽
      fill.setPosition(-innerW / 2 + w / 2, -85 * k, 1); // 左对齐：居中锚点公式
      fill.active = !u.dead;
      chip.active = !u.dead; // 「已击败」只显示一处：死亡隐藏胶囊与条，保留中央遮罩
      (num.getComponent('cc.Label') as any).string = u.dead
        ? deadText
        : `${Math.max(0, Math.floor(u.hp))}/${u.maxHp}`;
      mask.active = u.dead;
    },
  };
}

/** 卡内窗稀有度/梯队色垫底（R2 P1-4 改整卡铺设）：
 * card_plate_cloud 是内窗不透明的实底卡版，整卡铺满后内窗露出染色云纹（无露白），
 * 自带金边区域被上层 frame_spirit_card 的不透明金边盖住。
 * ⚠️ 必须做成 card 的**兄弟节点**且先于 card 添加——Cocos 子节点永远渲染在父之上，
 * 若作为 card 的子节点整卡铺会把金框盖住。 */
function makeCardBackdrop(parent: Node, x: number, y: number, cardW: number, cardH: number, hex: string): void {
  const back = makeUi3Sprite(parent, 'card_plate_cloud', cardW, cardH);
  back.setPosition(x, y, 0);
  tintUiSprite(back, hex, 150);
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
  // R1 验收 P1-5：数字 Label 左对齐（锚点 x=0、从图标右缘起排）+ SHRINK 限宽，
  // 七八位数（如 53251926）自动缩字，不再回压图标。
  const status = makeUi3Sprite(root, 'panel_status', 729, 70);
  status.setPosition(0, 622, 0);
  const RES: Array<[string, () => string]> = [
    ['icon_stone', () => `${Math.floor(s.gold)}`],
    ['icon_jade', () => `${s.cores || 0}`],
    ['icon_talisman', () => `${s.tickets}`],
    ['icon_moon', () => `${Math.max(1, s.bestWave || 1)}`],
  ];
  const resLabels: Node[] = [];
  RES.forEach(([icon, get], i) => {
    const x = -116 + i * 124;
    makeUi3Sprite(status, icon, 28, 33).setPosition(x - 26, 0, 1);
    const num = makeLabel(status, get(), { fontSize: 18, color: JADE.goldText, align: 0 });
    const nut = num.getComponent(UITransform) as any;
    nut.anchorX = 0; // 左对齐锚点：文字只向右生长
    const lab = num.getComponent('cc.Label') as any;
    lab.overflow = 2; // 2 = SHRINK：超宽自动缩字号（web-mobile 不导出枚举，用数值）
    setSize(num, 80, 26);
    num.setPosition(x + 4, 0, 1); // 图标右缘 x-12，净距 16px（R3 P2-1：方章光晕外扩，再右移一档）；
    // 限宽 84：下组图标左缘 = x+84，再宽 SHRINK 后的长数字右缘会压进下一组图标
    resLabels.push(num);
  });
  const refreshInfo = (): void => {
    RES.forEach(([, get], i) => {
      const n = resLabels[i];
      if (n && n.isValid) (n.getComponent('cc.Label') as any).string = get();
    });
  };
  refreshInfo();

  // ② 进度行（R1 验收 P2-7：删「历史最高 X 波」——波次动态信息唯一出处=金色徽章；
  // 「主角 Lv」从资源栏移入本行（P1-5）。当前波超过纪录时提示「新纪录！」）
  const progressLbl = makeLabel(root, '', { fontSize: 17, color: JADE.sub });
  setSize(progressLbl, 660, 22);
  progressLbl.setPosition(-40, 575, 0);
  const refreshProgress = (ev?: BattleEvent): void => {
    const kills = ev && ev.kills !== undefined ? ev.kills : battle.kills;
    const total = battle.enemies.length;
    const best = Math.max(1, s.bestWave || 1);
    const rec = battle.wave > best ? '　◆ 新纪录！' : '';
    (progressLbl.getComponent('cc.Label') as any).string =
      `主角 Lv.${s.level} · 本关击杀 ${kills}/${total} · 第 ${battle.attempts + 1} 次挑战${rec}`;
  };

  // ③ 波次徽章（button_wave，文字已清空由程序绘）
  const badge = makeUi3Sprite(root, 'button_wave', 220, 58);
  badge.setPosition(230, 540, 0);
  const waveLbl = makeLabel(badge, `第 ${startWave} 波`, { fontSize: 22, color: JADE.goldText });
  waveLbl.setPosition(0, 0, 1);

  // ④ 敌方总血条（R2 P0-2 方案 B）：bg 换 panel_section_jade（深绿实心+两端金菱，全高实心），
  // fill=bar_fill_red/gold 22 高居中嵌在槽内——结构简单不再有上下条带对位问题。
  // 旧 bar_thick_green 方案废弃：绿条区在源图顶部、米白托板在下，fill y 符号算反导致红条压托板。
  const HPBG_W = 620;
  const HP_INNER_W = 586; // fill 最大宽 590 − 左右内缩 2px×2
  const HP_FILL_H = 22;
  const HP_FILL_Y = 0;
  const hpBg = makeUi3Sprite(root, 'panel_section_jade', HPBG_W, 44);
  hpBg.name = 'ui_bar_hp_bg'; // 端到端探针兼容
  hpBg.setPosition(0, 495, 0);
  const hpFillR = makeUi3Sprite(hpBg, 'bar_fill_red', HP_INNER_W, HP_FILL_H);
  hpFillR.name = 'ui_bar_hp_fill';
  hpFillR.setPosition(0, HP_FILL_Y, 1);
  const hpFillG = makeUi3Sprite(hpBg, 'bar_fill_gold', HP_INNER_W, HP_FILL_H);
  hpFillG.name = 'ui_bar_hp_fill_gold';
  hpFillG.setPosition(0, HP_FILL_Y, 1);
  hpFillG.active = false;

  // 「敌方 · 梯队 · 蚀灵教」标题独立行（R1 验收 P1-3：删珊瑚粉横幅，文案并入此处；
  // 不压条、不与右侧金色波次徽章重叠）
  const hpLbl = makeLabel(root, `敌方 · ${tierLabel(startWave)} · 蚀灵教`, { fontSize: 17, color: '#FFF8E8' });
  setSize(hpLbl, 420, 22);
  hpLbl.setPosition(-110, 534, 0);

  // —— 敌方编队（蚀灵教）：每只怪一张金框卡 ——
  const enemyRow = new Node('enemyRow');
  root.addChild(enemyRow);
  enemyRow.setPosition(0, 338, 0); // R2 P1-3：320→338，给下方两排卡让出与敌区零重叠的空间
  const enemySlots: Node[] = []; // 敌方出手高亮用（下标 = 敌方编队下标）
  let enemyBars: UnitBar[] = [];
  const renderEnemies = (team: EnemyDef[]): void => {
    enemyRow.removeAllChildren();
    enemyBars = [];
    enemySlots.length = 0;
    const n = team.length;
    const gap = ENEMY_CARD.w + 22; // §2：3 列卡牌，列间距 ~22
    const ek = ENEMY_CARD.h / 240;
    team.forEach((e, i) => {
      const x = (i - (n - 1) / 2) * gap;
      // 稀有度垫底（P1-4）：兄弟节点先铺，梯队色阶染色云纹整卡衬底
      makeCardBackdrop(enemyRow, x, 0, ENEMY_CARD.w, ENEMY_CARD.h, TIER_STAGE[e.tier] || TIER_STAGE[1]);
      const card = makeUi3Sprite(enemyRow, 'frame_spirit_card', ENEMY_CARD.w, ENEMY_CARD.h);
      card.setPosition(x, 0, 0);
      // 立绘放内窗（中心偏上 22×k），clip 硬裁剪兜底：任何立绘都不许出框（P0-1）
      makeSpirit(card, enemyResPath(e.id), INNER.w * ek, '❓', INNER.h * ek, 1, true)
        .setPosition(0, INNER.cy * ek, 0);
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
  // 出手高亮（R3 建议）：只放大卡内立绘子节点 'spirit'，金框/布局不动——
  // 旧版整卡 1.15 会让相邻卡视觉贴连（真机实测间隙 60→16px）
  const bump = (n: Node | undefined): void => {
    const sp = n && n.isValid ? n.getChildByName('spirit') : null;
    if (!sp) return;
    sp.setScale(1.15, 1.15, 1);
    setTimeout(() => { if (sp.isValid) sp.setScale(1, 1, 1); }, 380);
  };

  const team = s.team || [];
  const count = team.length + 1; // 主角 + 编队
  const SLOT = count === 1 ? HERO_CARD : count === 2 ? CARD_2 : CARD_3;
  const singleRow = count <= 3;
  const perRow = singleRow ? count : Math.ceil(count / 2);
  // 单行布局：卡顶不得超过敌方卡行下沿（敌卡底 = 338 - 120 = 218，留 16px 余量），
  // 否则主角大卡会压住敌方卡牌（R3 确认 bug 的同款约束）。
  const ALLY_TOP_SAFE = 202;
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
  // 立绘窗口按卡高等比换算（k = cardH/240）
  const ak = SLOT.h / 240;
  // 主角卡（立绘：spirits/protagonist.png，设定=执笔育灵师·小椿；垫底=灵气金）
  const [hx, hy] = allyPos(0);
  makeCardBackdrop(allyRow, hx, hy, SLOT.w, SLOT.h, '#e0a93f');
  const heroCard = makeUi3Sprite(allyRow, 'frame_spirit_card', SLOT.w, SLOT.h);
  heroCard.setPosition(hx, hy, 0);
  makeSpirit(heroCard, 'spirits/protagonist', INNER.w * ak, '🌸', INNER.h * ak, 1, true)
    .setPosition(0, INNER.cy * ak, 0);
  allyBars.push(makeUnitBar(heroCard, SLOT.w, SLOT.h, 'green', '主角·小椿', '倒下'));
  slots['__hero'] = heroCard;

  team.forEach((id, i) => {
    const sp = SPIRIT_BY_ID[id];
    const [x, y] = allyPos(i + 1);
    // 稀有度垫底（P1-4）：GameConfig 稀有度四色原值，alpha 150
    makeCardBackdrop(allyRow, x, y, SLOT.w, SLOT.h, sp ? RARITY_COLOR[sp.rarity] : '#9aa0a6');
    const card = makeUi3Sprite(allyRow, 'frame_spirit_card', SLOT.w, SLOT.h);
    card.setPosition(x, y, 0);
    makeSpirit(card, sp ? spiritResPath(sp, s.prog?.[id]?.evo ?? 0) : '', INNER.w * ak, sp?.icon ?? '❓', INNER.h * ak, 1, true)
      .setPosition(0, INNER.cy * ak, 0);
    allyBars.push(makeUnitBar(card, SLOT.w, SLOT.h, 'green', sp?.name ?? '???', '倒下'));
    slots[id] = card;
  });

  // —— 战斗日志：panel_jade_large 深绿云纹大面板（自带金双边框）——
  // R2 P1-3/P2-6：面板 160→186 高、y -320→-333（给两排卡让出排距，同时吃掉下方空白）
  // 文字顶锚（anchorY=1）+ SHRINK：多行只向下生长且超行自动缩字号
  const logPanel = makeUi3Sprite(root, 'panel_jade_large', 660, 186);
  logPanel.setPosition(0, -333, 0);
  const logLabel = makeLabel(logPanel, `${tierLabel(startWave)} · 挂机战斗中…`, { fontSize: 18, color: JADE.body, wrapWidth: 600 });
  const logLab = logLabel.getComponent('cc.Label') as any;
  logLab.overflow = 2; // 2 = Overflow.SHRINK（web-mobile 构建不导出枚举，用数值）
  logLab.lineHeight = 27;
  setSize(logLabel, 600, 132);
  (logLabel.getComponent(UITransform) as any).anchorY = 1;
  logLabel.setPosition(0, 72, 1);
  logSink = (msg: string) => {
    const cur = (logLabel.getComponent('cc.Label') as any).string || '';
    const lines = cur.split('\n').filter(Boolean);
    lines.push(msg);
    (logLabel.getComponent('cc.Label') as any).string = lines.slice(-5).join('\n');
  };

  // ⑥ 日志与导航之间的收边（R2 P2-6 / R3 P2-2 提对比度）：
  // 金线 tint 加深一档（浅云雾底上原色若隐若现）；小字换深墨绿（对比 ≈5.5:1）
  const divider = makeUi3Sprite(root, 'deco_divider_gold', 620, 14);
  divider.setPosition(0, -470, 0);
  tintUiSprite(divider, '#B89355');
  makeLabel(root, '· 蚀灵教 ·', { fontSize: 16, color: '#4A5A48' }).setPosition(0, -493, 0);

  const syncBars = (): void => {
    battle.enemies.forEach((u, i) => { if (enemyBars[i]) enemyBars[i].update(u); });
    battle.allies.forEach((u, i) => { if (allyBars[i]) allyBars[i].update(u); });
  };

  // R4 可选 P2：总血条宽度 0.25s 缓动（每杀一只跳约 33%，把断崖式跳变抹平）。
  // 规则：① 只缓动「下降」；换波回满（宽度增大）瞬时重置，否则会看到血条慢慢涨回来；
  //      ② 每次新 tick 先停掉上一段，避免多段 tween 叠加写同一节点；
  //      ③ 页面切换时 gm.cleanup 停 tween，防止回调写已销毁节点。
  const hpAnim = { w: HP_INNER_W };
  let hpCurW = HP_INNER_W;   // 当前显示宽度（含缓动中间值）
  let hpTween: any = null;
  const applyHpWidth = (w: number): void => {
    const width = Math.max(1, w);
    hpCurW = width;
    for (const f of [hpFillR, hpFillG]) {
      if (!f.isValid) continue;
      setSize(f, width, HP_FILL_H);
      f.setPosition(-HP_INNER_W / 2 + width / 2, HP_FILL_Y, 1); // 左对齐：居中锚点公式
    }
  };

  const setTotalHp = (ratio: number, wave: number, snap = false): void => {
    const target = Math.max(1, Math.min(1, ratio) * HP_INNER_W);
    const gold = barFillName(wave) === 'bar_fill_gold';
    hpFillR.active = !gold;
    hpFillG.active = gold;
    console.log(`[ylsz] enemyRatio=${Math.min(1, ratio).toFixed(3)} wave=${wave} gold=${gold}`); // R2：真机核对语义（剩余HP/总HP）
    if (hpTween) { hpTween.stop(); hpTween = null; }
    // 进页首次 / 换波回满 / 无变化：瞬时定位，不做缓动
    if (snap || target >= hpCurW - 0.5 || Math.abs(target - hpCurW) < 1) {
      hpAnim.w = target;
      applyHpWidth(target);
      return;
    }
    hpAnim.w = hpCurW;
    hpTween = tween(hpAnim)
      .to(0.25, { w: target }, {
        easing: 'sineOut',
        onUpdate: () => { if (hpFillR.isValid) applyHpWidth(hpAnim.w); },
        onComplete: () => { hpTween = null; },
      })
      .start();
  };

  const onTick = (ev: BattleEvent) => {
    const curWave = ev.wave ?? battle.wave;
    setTotalHp(ev.ratio, curWave);
    (waveLbl.getComponent('cc.Label') as any).string = `第 ${curWave} 波`;
    (hpLbl.getComponent('cc.Label') as any).string = `敌方 · ${tierLabel(curWave)} · 蚀灵教`;
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
  setTotalHp(battle.enemyRatio(), battle.wave, true); // 进页首次：瞬时定位，不演出缓动
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
  gm.cleanup = () => {
    if (hpTween) { hpTween.stop(); hpTween = null; } // 切页时停掉血条缓动，防止写已销毁节点
    battle.stop();
  };
}
