// 战斗难度梯队 + 单位数值（纯数据 + 纯函数，零引擎依赖）
// ---------------------------------------------------------------------------
// 设计目标：
//   1. 每只怪、每个我方上场角色都有独立血量；敌人伤害按波次曲线递增，形成真实「卡关」；
//   2. 敌人血量/伤害只由「波次 + 敌人层级」决定，不吃我方攻击——升级、抽卡、进化是纯收益；
//   3. 奖励按「每只击杀」即时掉落，不再等整波清空；
//   4. 团灭时：本关 0 击杀 → 退回上一关修炼；有击杀 → 留在本关反复挑战（见 decideAfterWipe）；
//   5. 每 10 波关底、每 30 波教主；100 波后无尽曲线继续增长，避免强队无限平推。
// 本文件不 import 任何模块，可用 `node --experimental-strip-types` 直接跑验证。

export interface DifficultyStage {
  key: string;
  /** 梯队名（战斗页血条展示） */
  name: string;
  /** 起始波次（含） */
  from: number;
  /** 结束波次（含）；null = 无尽 */
  to: number | null;
  /** 本梯队首波的血量倍率 */
  hpMul: number;
  /** 本梯队内每多 1 波的血量增幅（相对 hpMul 线性叠加） */
  hpPerWave: number;
  /** 血量倍率上限（null = 不封顶） */
  hpCap: number | null;
  /** 普通波的敌人层级组合池：每项是一波 3 只敌人的 tier 数组 */
  normalComp: number[][];
  /** 关底波的随从层级（关底固定再带 1 名长老） */
  eliteTiers: number[];
  /** 灵气 / 灵核奖励倍率 */
  rewardMul: number;
}

/** 每 10 波一章，每 30 波教主 */
export const CHAPTER_WAVES = 10;
export const ELITE_EVERY = 10;
export const BOSS_EVERY = 30;

/**
 * 梯队表：改这里即可整体调难度。
 * 血量倍率曲线（不含敌人阵容强度）：
 *   波 1 = 1.00 → 波 10 = 1.25 → 波 30 = 1.74 → 波 60 = 2.26
 *   → 波 100 = 3.20 → 波 101 = 3.35 → 封顶 14.00
 */
export const DIFFICULTY_STAGES: DifficultyStage[] = [
  {
    key: 'outer', name: '外门·试炼', from: 1, to: 10,
    hpMul: 1.00, hpPerWave: 0.028, hpCap: null,
    normalComp: [[1, 1, 1]],
    eliteTiers: [1, 1],
    rewardMul: 1.0,
  },
  {
    key: 'inner', name: '内门·蚀阵', from: 11, to: 30,
    hpMul: 1.30, hpPerWave: 0.018, hpCap: null,
    normalComp: [[1, 1, 2], [1, 2, 1], [1, 1, 1]],
    eliteTiers: [2, 1],
    rewardMul: 1.3,
  },
  {
    key: 'elder', name: '长老·镇灵', from: 31, to: 60,
    hpMul: 1.75, hpPerWave: 0.010, hpCap: null,
    normalComp: [[1, 2, 2], [2, 2, 1], [2, 1, 2]], // 内门弟子只有 2 人，避免同波重复立绘
    eliteTiers: [2, 2],
    rewardMul: 1.7,
  },
  {
    key: 'lord', name: '教主·蚀灵', from: 61, to: 100,
    hpMul: 2.30, hpPerWave: 0.010, hpCap: null,
    normalComp: [[2, 2, 3], [2, 3, 2], [1, 2, 3]],
    eliteTiers: [2, 3],
    rewardMul: 2.2,
  },
  {
    key: 'abyss', name: '无尽·深渊', from: 101, to: null,
    hpMul: 3.35, hpPerWave: 0.012, hpCap: 14,
    normalComp: [[2, 3, 3], [3, 3, 2], [2, 2, 3]],
    eliteTiers: [3, 2], // 长老只有 2 人，第 3 人换内门弟子，避免重复立绘
    rewardMul: 2.8,
  },
];

export function stageForWave(wave: number): DifficultyStage {
  const w = Math.max(1, Math.floor(wave) || 1);
  for (const s of DIFFICULTY_STAGES) {
    if (w >= s.from && (s.to === null || w <= s.to)) return s;
  }
  return DIFFICULTY_STAGES[DIFFICULTY_STAGES.length - 1];
}

export function stageIndexForWave(wave: number): number {
  const s = stageForWave(wave);
  return DIFFICULTY_STAGES.indexOf(s);
}

/** 波次血量倍率（梯队基线 × 波内增长，受 hpCap 限制） */
export function waveHpScale(wave: number): number {
  const s = stageForWave(wave);
  const n = Math.max(0, wave - s.from);
  const raw = s.hpMul * (1 + s.hpPerWave * n);
  return s.hpCap === null ? raw : Math.min(raw, s.hpCap);
}

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % BOSS_EVERY === 0;
}

export function isEliteWave(wave: number): boolean {
  return wave > 0 && wave % ELITE_EVERY === 0 && !isBossWave(wave);
}

/** 关底 / 教主波的额外压力 */
export const ELITE_PRESSURE = 1.15;
export const BOSS_PRESSURE = 1.30;
export function wavePressure(wave: number): number {
  return isBossWave(wave) ? BOSS_PRESSURE : isEliteWave(wave) ? ELITE_PRESSURE : 1;
}

// ─────────────────────────────────────────────────────────────
// 单位数值：全部只由「波次 + 敌人层级」决定，我方变强就是纯收益
// ─────────────────────────────────────────────────────────────

/** 我方：主角血量/攻击随等级成长；精灵血量 ×2 让前排能扛住几轮反击 */
export const HERO_HP_BASE = 60;
export const HERO_HP_PER_LEVEL = 15;
export const HERO_ATK_BASE = 8;
export const HERO_ATK_PER_LEVEL = 2;
export const ALLY_HP_MULT = 2;

export function heroMaxHp(level: number): number {
  return HERO_HP_BASE + Math.max(1, Math.floor(level) || 1) * HERO_HP_PER_LEVEL;
}
export function heroAtk(level: number): number {
  return HERO_ATK_BASE + Math.max(1, Math.floor(level) || 1) * HERO_ATK_PER_LEVEL;
}

/** 敌人基准：单只杂兵血量 / 每 tick 伤害 */
export const ENEMY_HP_BASE = 60;
export const ENEMY_ATK_BASE = 1;

/** 伤害曲线比血量更陡（血量倍率的平方），高波次才会真正卡关 */
export const DMG_WAVE_EXP = 2;
export function waveDmgScale(wave: number): number {
  return Math.pow(waveHpScale(wave), DMG_WAVE_EXP);
}

/** 100 波后无尽线性增长，避免强队把深渊平推到底 */
export const ABYSS_FROM = 100;
export const ABYSS_PER_WAVE = 0.03;
export function abyssScale(wave: number): number {
  return wave <= ABYSS_FROM ? 1 : 1 + (wave - ABYSS_FROM) * ABYSS_PER_WAVE;
}

/** 单只敌人的最大血量（层级 hpMul 让同波三只怪血量各不相同） */
export function enemyUnitHp(wave: number, hpMul: number): number {
  const raw = ENEMY_HP_BASE * waveHpScale(wave) * wavePressure(wave)
    * abyssScale(wave) * Math.max(0.1, hpMul);
  return Math.max(1, Math.floor(raw));
}

/** 单只敌人每 tick 对我方一个单位造成的伤害 */
export function enemyUnitAtk(wave: number, hpMul: number): number {
  const raw = ENEMY_ATK_BASE * waveDmgScale(wave) * wavePressure(wave)
    * abyssScale(wave) * Math.max(0.1, hpMul);
  return Math.max(1, Math.floor(raw));
}

// ─────────────────────────────────────────────────────────────
// 击杀掉落（每只怪即时结算，不等整波清空）
// ─────────────────────────────────────────────────────────────
export const KILL_GOLD_RATE = 0.10;
export const KILL_CORE_RATE = 0.002;
/** 每高一阶额外 +35% 掉落 */
export const KILL_TIER_BONUS = 0.35;
/** 杂兵有 25% 概率额外掉 1 灵核；长老/教主必掉 */
export const CORE_CHANCE = 0.25;

export function killReward(
  enemyMaxHp: number,
  wave: number,
  tier: number,
  roll = 0.5,
): { gold: number; cores: number } {
  const mul = stageForWave(wave).rewardMul;
  const bonus = 1 + KILL_TIER_BONUS * Math.max(0, tier - 1);
  const gold = Math.max(1, Math.floor(enemyMaxHp * KILL_GOLD_RATE * mul * bonus));
  let cores = Math.floor(enemyMaxHp * KILL_CORE_RATE * mul * bonus);
  if (tier >= 3) cores += 1; // 长老 / 教主必掉灵核
  else if (roll < CORE_CHANCE) cores += 1;
  return { gold, cores };
}

// ─────────────────────────────────────────────────────────────
// 关卡推进决策（本次改动的核心规则，集中在此便于单测）
//   全关清空            → 进下一关
//   团灭且本关累计 0 击杀 → 退回上一关（打过上一关自然再回到本关）
//   团灭但已击杀 ≥1 只   → 留在本关一直打（已死的怪不复活、残血保留）
// ─────────────────────────────────────────────────────────────
export type WaveOutcome = 'advance' | 'hold' | 'regress';

export function decideAfterWipe(
  wave: number,
  kills: number,
): { outcome: WaveOutcome; nextWave: number } {
  const w = Math.max(1, Math.floor(wave) || 1);
  if (kills <= 0 && w > 1) return { outcome: 'regress', nextWave: w - 1 };
  // 有击杀（或已在第 1 关，无处可退）→ 留在本关继续挑战
  return { outcome: 'hold', nextWave: w };
}

/** 血条文案：波次 + 梯队 + 关底/教主标记 */
export function stageLabel(wave: number): string {
  const s = stageForWave(wave);
  const mark = isBossWave(wave) ? ' 【教主】' : isEliteWave(wave) ? ' 【关底】' : '';
  return `第 ${wave} 波 · ${s.name}${mark}`;
}

/** 下一个梯队（用于日志播报 / 后续 UI 提示）；无尽阶段返回 null */
export function nextStageAt(wave: number): { name: string; wave: number } | null {
  const s = stageForWave(wave);
  if (s.to === null) return null;
  const next = DIFFICULTY_STAGES[DIFFICULTY_STAGES.indexOf(s) + 1];
  return next ? { name: next.name, wave: s.to + 1 } : null;
}
