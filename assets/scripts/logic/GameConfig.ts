// 游戏全局配置（纯数据，零引擎依赖）
// 原 src/config.js 的 GAME_CONFIG / EVOLUTION / RARITY / SPIRIT_VERSION / recalcIdleMult 迁移而来。

export interface GachaConfig {
  singleCost: number;
  tenCost: number;
  ticketSingle: number;
  ticketTen: number;
  prob: { SSR: number; SR: number; R: number; N: number };
  softPityAt: number;
  softPityMax: number;
  tenGuaranteeSR: boolean;
  dupRefund: { N: number; R: number; SR: number; SSR: number };
}

export interface ShopConfig {
  ticketPrice: number;
  ticketPack10: number;
  dailyFreeTicket: number;
  adReward: number;
  adCooldownMin: number;
  directBuy: { R: number; SR: number };
  corePacks: { n: number; price: number }[];
  freeTestGold: number;
}

export interface GameConfigType {
  designWidth: number;
  designHeight: number;
  idle: { baseGoldPerSec: number; offlineCapHours: number };
  battle: { tickMs: number; enemyHpBase: number };
  team: { size: number };
  gacha: GachaConfig;
  shop: ShopConfig;
}

export const GAME_CONFIG: GameConfigType = {
  designWidth: 750,
  designHeight: 1334,

  idle: {
    baseGoldPerSec: 2,
    offlineCapHours: 8,
  },

  battle: {
    tickMs: 1000,
    enemyHpBase: 50,
  },

  team: {
    size: 5,
  },

  gacha: {
    singleCost: 100,
    tenCost: 1000,
    ticketSingle: 1,
    ticketTen: 10,
    prob: { SSR: 0.03, SR: 0.12, R: 0.35, N: 0.5 },
    softPityAt: 50,
    softPityMax: 0.2,
    tenGuaranteeSR: true,
    dupRefund: { N: 5, R: 20, SR: 120, SSR: 600 },
  },

  shop: {
    ticketPrice: 100,
    ticketPack10: 900,
    dailyFreeTicket: 1,
    adReward: 200,
    adCooldownMin: 5,
    directBuy: { R: 800, SR: 4000 },
    corePacks: [
      { n: 1, price: 200 },
      { n: 10, price: 1800 },
      { n: 30, price: 4800 },
    ],
    freeTestGold: 10000,
  },
};

// —— 进化系统配置 ——
// 三阶段：0=初生 / 1=觉醒 / 2=真灵；每进化一阶，atk/hp 倍率 ×1.8（见 Spirits.spiritStats 的 1.8^evo）。
export const EVOLUTION = {
  stages: ['初生', '觉醒', '真灵'] as const,
  maxStarByEvo: [5, 8, 10], // 各阶段星上限（初生满 5★ 才能进化，进化后解锁更高星）
  evolveCost: {
    1: { dup: { N: 3, R: 5, SR: 8, SSR: 10 }, core: 10 }, // 初生 → 觉醒
    2: { dup: { N: 5, R: 8, SR: 12, SSR: 15 }, core: 25 }, // 觉醒 → 真灵
  },
  idleBonusPerStage: 0.05, // 每完成一阶进化，全局挂机收益 +5%
};

// 升星消耗（第 2 步）：每升 1 星消耗的重复卡数
export const STAR_COST: { N: number; R: number; SR: number; SSR: number } = {
  N: 1, R: 2, SR: 3, SSR: 5,
};
export const MAX_STAR = 5;

// 稀有度配色（图鉴 / 编队 / 抽卡共用）
export const RARITY_COLOR: { N: string; R: string; SR: string; SSR: string } = {
  N: '#9aa0a6', R: '#5fae57', SR: '#5fb6e6', SSR: '#e0a93f',
};
export const RARITY_LABEL: { N: string; R: string; SR: string; SSR: string } = {
  N: 'N', R: 'R', SR: 'SR', SSR: 'SSR',
};

// 当前精灵立绘缓存版本：改图后 +1，强制资源重新加载（Cocos 用 resources 动态加载，靠查询参数破缓存）
export const SPIRIT_VERSION = 28; // 28: 萤火灵 三阶段立绘更换（青幕抠像）

// 全局养成加成重算：idleMult = 等级收益(1 + (level-1)*0.1) + 进化总阶数 * 每阶加成
export function recalcIdleMult(state: {
  level: number;
  idleMult: number;
  prog: Record<string, { star: number; evo: number }>;
}): number {
  const levelMult = 1 + (state.level - 1) * 0.1;
  let stageSum = 0;
  for (const id in state.prog || {}) stageSum += (state.prog[id] && state.prog[id].evo) || 0;
  state.idleMult = levelMult + stageSum * EVOLUTION.idleBonusPerStage;
  return state.idleMult;
}
