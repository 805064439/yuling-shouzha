// 挂机战斗数值模拟：直接驱动真实 logic/Battle.ts（不启动 Cocos / setInterval）。
// 用法: node --experimental-strip-types --import ./tools/ts_register.mjs tools/sim_battle.mjs
// 目的：确认「新手能推关 / 高波次会 0 击杀退回 / 有击杀会留关」三条曲线成立，并给出调参依据。
import { Battle } from '../assets/scripts/logic/Battle.ts';
import { createDefaultState } from '../assets/scripts/logic/Save.ts';
import { SPIRITS } from '../assets/scripts/logic/Spirits.ts';
import { enemyUnitHp, enemyUnitAtk, waveHpScale } from '../assets/scripts/logic/Difficulty.ts';

/** 可复现 RNG（LCG），避免每次跑出不同结论 */
function makeRng(seed = 12345) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}

function teamOf(ids, star = 1, evo = 0) {
  const prog = {};
  const collection = {};
  for (const id of ids) { prog[id] = { star, evo }; collection[id] = 1; }
  return { team: [...ids], prog, collection };
}

const ROSTERS = {
  '新手·仅主角': { level: 1, ...teamOf([]) },
  '前期·3只N/R': { level: 3, ...teamOf(['cao', 'lu', 'ye']) },
  '中期·5只R/SR': { level: 8, ...teamOf(['ye', 'hua', 'rong', 'ying', 'tai']) },
  '强队·5只SSR满星真灵': { level: 20, ...teamOf(['shou', 'lu3', 'ying', 'tai', 'luling'], 5, 2) },
};

function run(name, roster, startWave, ticks) {
  const state = { ...createDefaultState(), ...roster, wave: startWave, bestWave: startWave, gold: 0, cores: 0 };
  const b = new Battle(state, () => {}, () => {}, makeRng(2026 + startWave));
  let clear = 0, regress = 0, retry = 0, maxWave = startWave, minWave = startWave;
  let killsTotal = 0, lastWave = startWave, lastGold = 0;
  for (let i = 0; i < ticks; i++) {
    const ev = b.tick();
    if (ev.result === 'clear') { clear++; killsTotal += (ev.enemyCount || 0); }
    else if (ev.result === 'regress') regress++;
    else if (ev.result === 'retry') retry++;
    maxWave = Math.max(maxWave, b.wave);
    minWave = Math.min(minWave, b.wave);
    lastWave = b.wave; lastGold = state.gold;
  }
  return { name, startWave, endWave: lastWave, maxWave, minWave, clear, regress, retry, killsTotal, gold: lastGold, cores: state.cores };
}

console.log('=== 单位数值抽样（每只怪独立血量/伤害）===');
for (const w of [1, 10, 30, 60, 100, 150, 200]) {
  console.log(`  波 ${String(w).padStart(3)}  血量×${waveHpScale(w).toFixed(2)}`
    + `  杂兵 ${enemyUnitHp(w, 1.0)}HP/${enemyUnitAtk(w, 1.0)}ATK`
    + `  长老 ${enemyUnitHp(w, 2.0)}HP/${enemyUnitAtk(w, 2.0)}ATK`
    + `  教主 ${enemyUnitHp(w, 3.5)}HP/${enemyUnitAtk(w, 3.5)}ATK`);
}

console.log('\n=== 从第 1 关挂机 600 tick（≈10 分钟）===');
const rows1 = [];
for (const [name, roster] of Object.entries(ROSTERS)) rows1.push(run(name, roster, 1, 600));
for (const r of rows1) {
  console.log(`  ${r.name.padEnd(22)} 1 → ${String(r.endWave).padStart(3)} 关`
    + `  最高 ${String(r.maxWave).padStart(3)}  通关 ${String(r.clear).padStart(3)} 次`
    + `  退关 ${String(r.regress).padStart(2)}  重试 ${String(r.retry).padStart(2)}`
    + `  灵气 ${r.gold}  灵核 ${r.cores}`);
}

console.log('\n=== 直接种到高关（验证 0 击杀退关 / 有击杀留关）===');
for (const [name, roster] of Object.entries(ROSTERS)) {
  for (const w of [60, 120, 200]) {
    const r = run(name, roster, w, 120);
    console.log(`  ${name.padEnd(22)} 种 ${String(w).padStart(3)} → ${String(r.endWave).padStart(3)} 关`
      + `  最低退到 ${String(r.minWave).padStart(3)}  退关 ${String(r.regress).padStart(2)}`
      + `  留关重试 ${String(r.retry).padStart(2)}  通关 ${r.clear}`);
  }
}

console.log('\n=== 断言 ===');
let pass = 0, fail = 0;
const assert = (n, c, extra = '') => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + '  ' + extra); } };
const novice = rows1[0], mid = rows1[2], strong = rows1[3];
assert('新手（仅主角）能通关，不会卡死在第 1 关', novice.clear > 0 && novice.maxWave > 1,
  `clear=${novice.clear} max=${novice.maxWave}`);
assert('队伍越强推得越远', strong.maxWave > mid.maxWave && mid.maxWave > novice.maxWave,
  `${novice.maxWave} < ${mid.maxWave} < ${strong.maxWave}`);
const wall = run('强队', ROSTERS['强队·5只SSR满星真灵'], 220, 120);
assert('强队在高关也会卡关（退关或原地再战）', wall.regress + wall.retry > 0,
  `regress=${wall.regress} retry=${wall.retry}`);
assert('卡关时波次不会超过起始关', wall.maxWave <= 220, `max=${wall.maxWave}`);
console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
