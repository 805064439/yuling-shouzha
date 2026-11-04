// 抽卡 / 商店 / 养成（升星 / 进化）纯逻辑层（零引擎依赖）
// 原 src/gacha.js 中除 DOM 渲染外的全部业务算法迁移而来。
// UI 层（scripts/ui）只负责调用这些函数并刷新界面，不在此处理数值。

import { GAME_CONFIG, EVOLUTION, STAR_COST, recalcIdleMult } from './GameConfig';
import { SPIRITS, SPIRIT_BY_ID, Spirit, Rarity } from './Spirits';
import { GameState } from './Save';

const RARITY_ORDER: Record<Rarity, number> = { N: 0, R: 1, SR: 2, SSR: 3 };

export function ensure(state: GameState): void {
  state.tickets = state.tickets || 0;
  state.collection = state.collection || {};
  state.prog = state.prog || {};
  state.cores = state.cores || 0;
  state.sinceSSR = state.sinceSSR || 0;
  state.lastDaily = state.lastDaily || '';
  state.lastAd = state.lastAd || 0;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// —— 抽卡核心 ——
export function rollRarity(state: GameState): Rarity {
  const g = GAME_CONFIG.gacha;
  let ssr = g.prob.SSR;
  if (state.sinceSSR >= g.softPityAt) {
    ssr = Math.min(g.softPityMax, g.prob.SSR + (state.sinceSSR - g.softPityAt + 1) * 0.01);
  }
  const r = Math.random();
  if (r < ssr) return 'SSR';
  if (r < ssr + g.prob.SR) return 'SR';
  if (r < ssr + g.prob.SR + g.prob.R) return 'R';
  return 'N';
}

export function pickByRarity(rarity: Rarity): Spirit {
  const pool = SPIRITS.filter((s) => s.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function draw(state: GameState, count: number): { results: Spirit[]; refund: number } {
  ensure(state);
  const results: Spirit[] = [];
  for (let i = 0; i < count; i++) {
    const rarity = rollRarity(state);
    if (rarity === 'SSR') state.sinceSSR = 0;
    else state.sinceSSR++;
    results.push(pickByRarity(rarity));
  }
  // 十连保底：至少一只 SR+
  if (count >= 10 && GAME_CONFIG.gacha.tenGuaranteeSR) {
    if (!results.some((s) => RARITY_ORDER[s.rarity] >= 2)) {
      results[results.length - 1] = pickByRarity('SR');
    }
  }
  // 入库 + 重复返还灵气
  let refund = 0;
  results.forEach((s) => {
    state.collection[s.id] = (state.collection[s.id] || 0) + 1;
    if (state.collection[s.id] > 1) refund += GAME_CONFIG.gacha.dupRefund[s.rarity];
  });
  state.gold += refund;
  return { results, refund };
}

export function canSummon(state: GameState, count: number): boolean {
  ensure(state);
  const ten = count === 10;
  const hasTicket =
    state.tickets >= (ten ? GAME_CONFIG.gacha.ticketTen : GAME_CONFIG.gacha.ticketSingle);
  if (hasTicket) return true;
  const cost = ten ? GAME_CONFIG.gacha.tenCost : GAME_CONFIG.gacha.singleCost;
  return state.gold >= cost;
}

export function doSummon(
  state: GameState,
  count: number,
): { results: Spirit[]; refund: number } | null {
  ensure(state);
  const ten = count === 10;
  const useTicket =
    state.tickets >= (ten ? GAME_CONFIG.gacha.ticketTen : GAME_CONFIG.gacha.ticketSingle);
  if (useTicket) {
    state.tickets -= ten ? GAME_CONFIG.gacha.ticketTen : GAME_CONFIG.gacha.ticketSingle;
  } else {
    const cost = ten ? GAME_CONFIG.gacha.tenCost : GAME_CONFIG.gacha.singleCost;
    if (state.gold < cost) return null;
    state.gold -= cost;
  }
  return draw(state, count);
}

// 一键抽光：优先十连，余下补单抽（仅消耗灵气）
export function drawAll(state: GameState): { results: Spirit[]; refund: number } {
  ensure(state);
  const g = GAME_CONFIG.gacha;
  const ten = Math.floor(state.gold / g.tenCost);
  const rem = state.gold - ten * g.tenCost;
  const single = Math.floor(rem / g.singleCost);
  if (ten === 0 && single === 0) return { results: [], refund: 0 };
  state.gold -= ten * g.tenCost + single * g.singleCost;
  let allResults: Spirit[] = [];
  let totalRefund = 0;
  for (let i = 0; i < ten; i++) {
    const r = draw(state, 10);
    allResults = allResults.concat(r.results);
    totalRefund += r.refund;
  }
  for (let i = 0; i < single; i++) {
    const r = draw(state, 1);
    allResults = allResults.concat(r.results);
    totalRefund += r.refund;
  }
  return { results: allResults, refund: totalRefund };
}

// —— 养成：升星 / 进化 ——
export function getProg(state: GameState, id: string): { star: number; evo: number } {
  return (state.prog && state.prog[id]) || { star: 1, evo: 0 };
}

export function doStarUp(state: GameState, id: string): boolean {
  ensure(state);
  const s = SPIRIT_BY_ID[id];
  if (!s) return false;
  const prog = getProg(state, id);
  const maxStar = EVOLUTION.maxStarByEvo[prog.evo || 0];
  if (prog.star >= maxStar) return false;
  const cost = STAR_COST[s.rarity];
  const need = 1 + cost * prog.star;
  if ((state.collection[id] || 0) < need) return false;
  state.collection[id] -= cost; // 消耗重复卡
  state.prog[id] = { star: prog.star + 1, evo: prog.evo || 0 };
  return true;
}

// 进化：满当前阶段星上限后，消耗重复卡 + 灵核，提升到下一形态（atk/hp ×1.8）
export function doEvolve(state: GameState, id: string): boolean {
  ensure(state);
  const s = SPIRIT_BY_ID[id];
  if (!s) return false;
  const prog = getProg(state, id);
  const evo = prog.evo || 0;
  if (evo >= 2) return false;
  const maxStar = EVOLUTION.maxStarByEvo[evo];
  if (prog.star < maxStar) return false;
  const nextEvo = evo + 1;
  const ec = EVOLUTION.evolveCost[nextEvo];
  const dupNeed = ec.dup[s.rarity];
  const coreNeed = ec.core;
  if ((state.collection[id] || 0) < dupNeed) return false;
  if ((state.cores || 0) < coreNeed) return false;
  state.collection[id] -= dupNeed;
  state.cores -= coreNeed;
  state.prog[id] = { star: prog.star, evo: nextEvo }; // 进化后保持当前星级，上限提升
  recalcIdleMult(state); // 重算挂机加成（+5%/阶）
  return true;
}

// —— 商店 / 每日 / 广告（纯数据变更，返回是否成功）——
export function claimDaily(state: GameState): boolean {
  ensure(state);
  if (state.lastDaily === todayStr()) return false;
  state.lastDaily = todayStr();
  state.tickets += GAME_CONFIG.shop.dailyFreeTicket;
  return true;
}

export function buyTicket(state: GameState, n: number): boolean {
  ensure(state);
  const cost = n === 10 ? GAME_CONFIG.shop.ticketPack10 : GAME_CONFIG.shop.ticketPrice * n;
  if (state.gold < cost) return false;
  state.gold -= cost;
  state.tickets += n;
  return true;
}

export function watchAd(state: GameState): boolean {
  ensure(state);
  if (Date.now() - (state.lastAd || 0) < GAME_CONFIG.shop.adCooldownMin * 60 * 1000) return false;
  state.lastAd = Date.now();
  state.gold += GAME_CONFIG.shop.adReward;
  return true;
}

export function buySpirit(state: GameState, id: string): boolean {
  ensure(state);
  const s = SPIRIT_BY_ID[id];
  if (!s) return false;
  const price = GAME_CONFIG.shop.directBuy[s.rarity];
  if (!price) return false;
  if (state.gold < price) return false;
  state.gold -= price;
  state.collection[id] = (state.collection[id] || 0) + 1;
  return true;
}

export function buyCore(state: GameState, n: number): boolean {
  ensure(state);
  const pack = GAME_CONFIG.shop.corePacks.find((p) => p.n === n);
  if (!pack) return false;
  if (state.gold < pack.price) return false;
  state.gold -= pack.price;
  state.cores = (state.cores || 0) + pack.n;
  return true;
}

export function buyFreeTest(state: GameState): boolean {
  ensure(state);
  state.gold += GAME_CONFIG.shop.freeTestGold;
  return true;
}
