// 难度梯队 + 单位数值 + 退关规则验证：直接 import 真实 TS 模块（Node 22 --experimental-strip-types）。
// 用法: node --experimental-strip-types tools/verify_difficulty.mjs
import {
  DIFFICULTY_STAGES, CHAPTER_WAVES, ELITE_EVERY, BOSS_EVERY,
  stageForWave, stageIndexForWave, waveHpScale, waveDmgScale,
  isBossWave, isEliteWave, wavePressure, stageLabel, nextStageAt,
  heroMaxHp, heroAtk, ALLY_HP_MULT,
  enemyUnitHp, enemyUnitAtk, abyssScale,
  killReward, decideAfterWipe,
  ELITE_PRESSURE, BOSS_PRESSURE, ENEMY_HP_BASE,
} from '../assets/scripts/logic/Difficulty.ts';
import { ENEMIES } from '../assets/scripts/logic/Enemies.ts';

let pass = 0, fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

console.log('=== 难度梯队总览 ===');
for (const s of DIFFICULTY_STAGES) {
  const end = s.to ?? '∞';
  const first = waveHpScale(s.from).toFixed(2);
  const last = waveHpScale(s.to ?? 400).toFixed(2);
  console.log(`  ${s.name.padEnd(6)} 波 ${String(s.from).padStart(3)}–${String(end).padStart(3)}`
    + `  血量×${first}→${last}  奖励×${s.rewardMul.toFixed(1)}`
    + `  杂兵层级 ${s.normalComp.map(c => c.join('')).join('/')}`);
}

// —— 1. 梯队边界 ——
console.log('\n=== 梯队边界 ===');
const bounds = [[1, 'outer'], [10, 'outer'], [11, 'inner'], [30, 'inner'],
  [31, 'elder'], [60, 'elder'], [61, 'lord'], [100, 'lord'],
  [101, 'abyss'], [9999, 'abyss']];
for (const [w, key] of bounds) assert(`波 ${w} → ${key}`, stageForWave(w).key === key, stageForWave(w).key);
assert('梯队表连续无空档', DIFFICULTY_STAGES.every((s, i) =>
  i === 0 ? s.from === 1 : s.from === DIFFICULTY_STAGES[i - 1].to + 1));

// —— 2. 血量曲线 ——
console.log('\n=== 血量曲线 ===');
let monotone = true, worst = 0;
for (let w = 2; w <= 500; w++) {
  const d = waveHpScale(w) - waveHpScale(w - 1);
  if (d < -1e-9) { monotone = false; worst = Math.min(worst, d); }
}
assert('波 2~500 血量倍率单调递增（跨梯队不回落）', monotone, `最大回落 ${worst}`);
assert('波1 = 1.00', near(waveHpScale(1), 1.0));
assert('波10 ≈ 1.25', waveHpScale(10) > 1.24 && waveHpScale(10) < 1.27, `${waveHpScale(10)}`);
assert('波30 ≈ 1.74', waveHpScale(30) > 1.70 && waveHpScale(30) < 1.80, `${waveHpScale(30)}`);
assert('波100 ≈ 3.20', waveHpScale(100) > 3.10 && waveHpScale(100) < 3.30, `${waveHpScale(100)}`);
assert('无尽阶段封顶 14', waveHpScale(1000) <= 14.000001 && waveHpScale(1000) > 13.9, `${waveHpScale(1000)}`);

// —— 3. 关底 / Boss ——
console.log('\n=== 关底与教主 ===');
assert('章长 10 波', CHAPTER_WAVES === 10);
assert('波10 是关底', isEliteWave(10) && !isBossWave(10));
assert('波20 是关底', isEliteWave(20) && !isBossWave(20));
assert('波30 是教主（不算关底）', isBossWave(30) && !isEliteWave(30));
assert('波60 是教主', isBossWave(60));
assert('普通波 5 无标记', !isEliteWave(5) && !isBossWave(5));
assert('教主每 30 波、关底每 10 波', BOSS_EVERY === 30 && ELITE_EVERY === 10);

// —— 4. 敌人编队合法 ——
console.log('\n=== 编队组合 ===');
assert('每个梯队普通波都是 3 人编队', DIFFICULTY_STAGES.every(s => s.normalComp.every(c => c.length === 3)));
assert('每个梯队关底随从 2 人', DIFFICULTY_STAGES.every(s => s.eliteTiers.length === 2));
const tiers = [...new Set(DIFFICULTY_STAGES.flatMap(s => [...s.normalComp.flat(), ...s.eliteTiers]))];
assert('引用的层级都有对应敌人', tiers.every(t => ENEMIES.some(e => e.tier === t)), `tiers=${tiers}`);
assert('教主存在', ENEMIES.some(e => e.tier === 4));
const tierCount = t => ENEMIES.filter(e => e.tier === t).length;
const noDup = comp => [1, 2, 3, 4].every(t => comp.filter(x => x === t).length <= tierCount(t));
assert('普通波不会因敌人池不足而出现重复立绘', DIFFICULTY_STAGES.every(s => s.normalComp.every(noDup)));
assert('关底波不会因敌人池不足而出现重复立绘', DIFFICULTY_STAGES.every(s => noDup([3, ...s.eliteTiers])));
assert('层级随梯队单调不降', DIFFICULTY_STAGES.every((s, i) => {
  if (i === 0) return true;
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  return avg(s.normalComp.flat()) >= avg(DIFFICULTY_STAGES[i - 1].normalComp.flat()) - 1e-9;
}));

// —— 5. 单位数值：每只怪独立血量 / 伤害，且升级是纯收益 ——
console.log('\n=== 单位血量与伤害 ===');
assert('第 1 波杂兵血量 = 基准值', enemyUnitHp(1, 1) === ENEMY_HP_BASE, `${enemyUnitHp(1, 1)}`);
assert('同波不同层级的怪血量不同（每只怪独立血量）',
  enemyUnitHp(10, 3.5) > enemyUnitHp(10, 1) * 3 && enemyUnitHp(10, 2) > enemyUnitHp(10, 1));
// 关底/教主波有额外压力，紧接的下一波会刻意回落作为「章节喘息」，故排除这些边界。
const afterPressure = w => isEliteWave(w - 1) || isBossWave(w - 1);
assert('敌人血量随波次单调递增（跨章喘息除外）', (() => {
  for (let w = 2; w <= 500; w++) {
    if (!afterPressure(w) && enemyUnitHp(w, 1) < enemyUnitHp(w - 1, 1)) return false;
  }
  return true;
})());
assert('敌人伤害随波次单调递增（跨章喘息除外）', (() => {
  for (let w = 2; w <= 500; w++) {
    if (!afterPressure(w) && enemyUnitAtk(w, 1) < enemyUnitAtk(w - 1, 1)) return false;
  }
  return true;
})());
assert('伤害曲线比血量更陡（形成真实卡关）',
  waveDmgScale(100) / waveDmgScale(1) > waveHpScale(100) / waveHpScale(1) * 3);
assert('100 波后无尽继续增长', abyssScale(200) > abyssScale(100) && abyssScale(100) === 1);
assert('关底波有额外压力', near(wavePressure(10), ELITE_PRESSURE));
assert('教主波压力更高', near(wavePressure(30), BOSS_PRESSURE) && BOSS_PRESSURE > ELITE_PRESSURE);
assert('普通波无额外压力', near(wavePressure(9), 1));
assert('主角升级同时加血加攻，且不改变敌人数值',
  heroMaxHp(11) > heroMaxHp(1) && heroAtk(11) > heroAtk(1)
  && enemyUnitHp(30, 1) === enemyUnitHp(30, 1));
assert('精灵血量有前排加成', ALLY_HP_MULT >= 2);

// —— 6. 击杀掉落 ——
console.log('\n=== 每只击杀掉落 ===');
let rewardMonotone = true;
for (let w = 2; w <= 500; w++) {
  if (killReward(10000, w, 1, 1).gold < killReward(10000, w - 1, 1, 1).gold) rewardMonotone = false;
}
assert('单只掉落随波次不下降', rewardMonotone);
assert('无尽梯队单只掉落 ×2.8', killReward(10000, 200, 1, 1).gold > killReward(10000, 5, 1, 1).gold * 2.5);
assert('高层级怪掉落更多', killReward(1000, 50, 4, 1).gold > killReward(1000, 50, 1, 1).gold);
assert('长老/教主必掉灵核', killReward(60, 1, 3, 1).cores >= 1 && killReward(60, 1, 4, 1).cores >= 1);
assert('杂兵按概率掉灵核（roll=0 掉 / roll=1 不掉）',
  killReward(60, 1, 1, 0).cores === 1 && killReward(60, 1, 1, 1).cores === 0);
assert('每次击杀至少掉 1 灵气', killReward(1, 1, 1, 1).gold >= 1);

// —— 7. 关卡推进规则（用户指定的核心逻辑）——
console.log('\n=== 卡关回退规则 ===');
assert('第 1 关 0 击杀：无处可退，留在本关',
  decideAfterWipe(1, 0).outcome === 'hold' && decideAfterWipe(1, 0).nextWave === 1);
assert('第 12 关 0 击杀：退回第 11 关',
  decideAfterWipe(12, 0).outcome === 'regress' && decideAfterWipe(12, 0).nextWave === 11);
assert('有 1 只击杀：留在本关一直打',
  decideAfterWipe(12, 1).outcome === 'hold' && decideAfterWipe(12, 1).nextWave === 12);
assert('有 3 只击杀仍留在本关（等全清才推进）',
  decideAfterWipe(12, 3).outcome === 'hold' && decideAfterWipe(12, 3).nextWave === 12);
assert('高波次 0 击杀同样只退一关', decideAfterWipe(200, 0).nextWave === 199);
assert('异常波次被夹到第 1 关', decideAfterWipe(-5, 0).nextWave === 1);
assert('波次夹逼：0 击杀退回后不会低于 1', (() => {
  let w = 5;
  for (let i = 0; i < 20; i++) w = decideAfterWipe(w, 0).nextWave;
  return w === 1;
})());

// —— 8. 文案 ——
console.log('\n=== 文案 ===');
assert('血条文案含梯队名', stageLabel(45).includes('长老·镇灵'));
assert('关底文案带【关底】', stageLabel(20).includes('【关底】'));
assert('教主文案带【教主】', stageLabel(30).includes('【教主】'));
assert('下一梯队提示正确', nextStageAt(1)?.name === '内门·蚀阵' && nextStageAt(1)?.wave === 11);
assert('无尽阶段无下一梯队', nextStageAt(200) === null);
assert('梯队序号可用于跨档播报', stageIndexForWave(10) === 0 && stageIndexForWave(11) === 1);

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
