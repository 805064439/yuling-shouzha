// 战斗难度梯队（纯数据 + 纯函数，零引擎依赖）
// ---------------------------------------------------------------------------
// 设计目标：
//   1. 挂机推波必须「越打越难」——血量随波次平滑递增，敌人层级按梯队跃迁；
//   2. 每 10 波一章：章末长老关底，每 30 波教主 Boss，跨章有喘息但难度不回落；
//   3. 升级是纯收益——敌人血量不再乘以主角等级（旧公式会让升级反而更难打）；
//   4. 奖励随梯队放大，形成「推波 → 变强 → 推更远」的正反馈；
//   5. 无尽阶段设血量上限，避免数值膨胀到永远打不动。
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
 *   → 波 100 = 3.20 → 波 101 = 3.35 → 无尽封顶 14.00
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

/** 血量基准：敌人基础血 + 我方总攻击 ×0.5（换阵容不会失控，也不会越养越慢） */
export const HP_ATK_COEF = 0.5;
/** 击败奖励系数（相对敌人最大血量） */
export const GOLD_RATE = 0.18;
export const CORE_RATE = 0.015;
/** 章末压力：关底 / 教主波额外血量倍率，让每 10 波有一个可感知的台阶 */
export const ELITE_PRESSURE = 1.15;
export const BOSS_PRESSURE = 1.30;

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
export function wavePressure(wave: number): number {
  return isBossWave(wave) ? BOSS_PRESSURE : isEliteWave(wave) ? ELITE_PRESSURE : 1;
}

/** 敌人最大血量：不再乘主角等级（升级只增强我方，是纯收益） */
export function enemyMaxHp(baseHp: number, atkTotal: number, wave: number, enemyStrength: number): number {
  const base = baseHp + atkTotal * HP_ATK_COEF;
  return Math.max(1, Math.floor(base * waveHpScale(wave) * wavePressure(wave) * Math.max(0.1, enemyStrength)));
}

/** 击败奖励：随血量与梯队倍率放大 */
export function waveReward(hp: number, wave: number): { gold: number; cores: number } {
  const mul = stageForWave(wave).rewardMul;
  return {
    gold: Math.floor(hp * GOLD_RATE * mul),
    cores: Math.floor(hp * CORE_RATE * mul),
  };
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
