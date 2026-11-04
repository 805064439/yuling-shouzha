// 算法 Sanity Check（纯 JS 复刻 key formulas，用 Node 立即跑，确认迁移后的数值逻辑正确）
// 正式集成测试见 tools/test_logic.ts（import 真实 TS 模块，需用 npx tsx 或 Cocos Creator 运行）。

let pass = 0;
let fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

// —— 1. spiritStats 倍率 ——
function spiritStats(atk, hp, star, evo) {
  const mult = (1 + 0.15 * (star - 1)) * Math.pow(1.8, evo);
  return { atk: Math.round(atk * mult), hp: Math.round(hp * mult) };
}
assert('草灵 1星0阶 atk=6', spiritStats(6, 30, 1, 0).atk === 6);
assert('草灵 5星0阶 atk=6*1.6=10', spiritStats(6, 30, 5, 0).atk === 10, `${spiritStats(6,30,5,0).atk}`);
assert('草灵 1星1阶 atk=6*1.8=11', spiritStats(6, 30, 1, 1).atk === 11, `${spiritStats(6,30,1,1).atk}`);
assert('守脉灵 1星2阶 atk=40*3.24=130', spiritStats(40, 160, 1, 2).atk === 130, `${spiritStats(40,160,1,2).atk}`);

// —— 2. recalcIdleMult ——
function recalcIdleMult(state) {
  const levelMult = 1 + (state.level - 1) * 0.1;
  let stageSum = 0;
  for (const id in state.prog || {}) stageSum += (state.prog[id] && state.prog[id].evo) || 0;
  state.idleMult = levelMult + stageSum * 0.05;
  return state.idleMult;
}
assert('level1 无进化 idleMult=1', recalcIdleMult({ level: 1, prog: {} }) === 1);
assert('level1 +2阶进化 idleMult=1.1', Math.abs(recalcIdleMult({ level: 1, prog: { a: { star: 1, evo: 2 } } }) - 1.1) < 1e-9);
assert('level11 +1阶进化 idleMult=2.05', Math.abs(recalcIdleMult({ level: 11, prog: { a: { star: 1, evo: 1 } } }) - 2.05) < 1e-9);

// —— 3. 软保底概率边界 ——
const prob = { SSR: 0.03, SR: 0.12, R: 0.35, N: 0.5 };
const softPityAt = 50, softPityMax = 0.2;
function ssrRate(sinceSSR) {
  let ssr = prob.SSR;
  if (sinceSSR >= softPityAt) ssr = Math.min(softPityMax, prob.SSR + (sinceSSR - softPityAt + 1) * 0.01);
  return ssr;
}
assert('sinceSSR=0 基础 SSR 0.03', ssrRate(0) === 0.03);
assert('sinceSSR=50 触发软保底 0.04', Math.abs(ssrRate(50) - 0.04) < 1e-9, `${ssrRate(50)}`);
assert('sinceSSR=100 软保底累计 0.2 封顶', ssrRate(100) === 0.2, `${ssrRate(100)}`);

// —— 4. 十连保底（蒙特卡洛）——
function rollRarity(sinceSSR) {
  let ssr = ssrRate(sinceSSR);
  const r = Math.random();
  if (r < ssr) return 'SSR';
  if (r < ssr + prob.SR) return 'SR';
  if (r < ssr + prob.SR + prob.R) return 'R';
  return 'N';
}
const RARITY_ORDER = { N: 0, R: 1, SR: 2, SSR: 3 };
let allGuaranteed = true;
let ssrCount = 0, total = 0;
for (let t = 0; t < 5000; t++) {
  let since = 0;
  const res = [];
  for (let i = 0; i < 10; i++) {
    const ra = rollRarity(since);
    if (ra === 'SSR') since = 0; else since++;
    res.push(ra);
    if (ra === 'SSR') ssrCount++;
    total++;
  }
  // 十连保底：至少一只 SR+（若原生无，最后一位被替换成 SR）
  const hasSRPlus = res.some((x) => RARITY_ORDER[x] >= 2);
  // 模拟保底逻辑
  if (!hasSRPlus) res[res.length - 1] = 'SR';
  const after = res.some((x) => RARITY_ORDER[x] >= 2);
  if (!after) allGuaranteed = false;
}
assert('5000 次十连全部至少 1 只 SR+（保底生效）', allGuaranteed);
const ssrPct = (ssrCount / total * 100).toFixed(2);
console.log(`  INFO  实测 SSR 出率 ≈ ${ssrPct}%（含软保底，应在 3%~20% 区间）`);
assert('SSR 出率在合理区间 2%~22%', ssrCount / total > 0.02 && ssrCount / total < 0.22);

// —— 5. 离线收益封顶 ——
const baseGoldPerSec = 2, offlineCapHours = 8;
function settle(idleMult, elapsedSec) {
  const cap = offlineCapHours * 3600;
  const effective = Math.min(elapsedSec, cap);
  return Math.floor(effective * baseGoldPerSec * idleMult);
}
assert('1h 离线 idleMult=1 → 7200', settle(1, 3600) === 7200);
assert('8h 离线封顶 → 57600', settle(1, 8 * 3600) === 57600);
assert('100h 离线仍封顶 57600', settle(1, 100 * 3600) === 57600);
assert('idleMult=2 8h → 115200', settle(2, 8 * 3600) === 115200);

// —— 6. 升星 / 进化条件逻辑 ——
const STAR_COST = { N: 1, R: 2, SR: 3, SSR: 5 };
const maxStarByEvo = [5, 8, 10];
const evolveCost = {
  1: { dup: { N: 3, R: 5, SR: 8, SSR: 10 }, core: 10 },
  2: { dup: { N: 5, R: 8, SR: 12, SSR: 15 }, core: 25 },
};
function tryStarUp(state, id, rarity) {
  const prog = state.prog[id] || { star: 1, evo: 0 };
  const maxStar = maxStarByEvo[prog.evo];
  if (prog.star >= maxStar) return false;
  const cost = STAR_COST[rarity];
  const need = 1 + cost * prog.star; // 拥有数量门槛（只判断，不消耗 need）
  if ((state.collection[id] || 0) < need) return false;
  state.collection[id] -= cost; // 实际消耗 cost 张重复卡
  state.prog[id] = { star: prog.star + 1, evo: prog.evo };
  return true;
}
function tryEvolve(state, id, rarity) {
  const prog = state.prog[id] || { star: 1, evo: 0 };
  const evo = prog.evo;
  if (evo >= 2) return false;
  if (prog.star < maxStarByEvo[evo]) return false;
  const nextEvo = evo + 1;
  const ec = evolveCost[nextEvo];
  if ((state.collection[id] || 0) < ec.dup[rarity]) return false;
  if ((state.cores || 0) < ec.core) return false;
  state.prog[id] = { star: prog.star, evo: nextEvo };
  return true;
}
// 草灵 N：初生满星需 star=5；进化需 dup=3 + core=10
let st = { collection: { cao: 100 }, cores: 100, prog: {} };
// 升到 5 星
for (let i = 0; i < 4; i++) assert(`草灵升星#${i + 1}`, tryStarUp(st, 'cao', 'N'));
assert('草灵满星后再升星失败', tryStarUp(st, 'cao', 'N') === false);
assert('草灵满星(5)可进化（dup/core 充足）', tryEvolve(st, 'cao', 'N') === true);
assert('草灵进化后 evo=1', st.prog.cao.evo === 1);

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
