// 难度梯队验证：直接 import 真实 TS 配置与纯函数（Node 22 --experimental-strip-types）。
// 用法: node --experimental-strip-types tools/verify_difficulty.mjs
import {
  DIFFICULTY_STAGES, CHAPTER_WAVES, ELITE_EVERY, BOSS_EVERY,
  stageForWave, stageIndexForWave, waveHpScale, isBossWave, isEliteWave,
  enemyMaxHp, waveReward, stageLabel, nextStageAt, wavePressure,
  HP_ATK_COEF, ELITE_PRESSURE, BOSS_PRESSURE,
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

// —— 5. 升级是纯收益（旧公式乘 level，越升越难）——
console.log('\n=== 升级收益 ===');
const baseHp = 50, wave = 50, strength = 1.3;
const atkLv1 = 10 + 60;   // 主角 8+2*1 + 队伍 60
const atkLv11 = 30 + 60;  // 主角 8+2*11 + 队伍 60
const hpLv1 = enemyMaxHp(baseHp, atkLv1, wave, strength);
const hpLv11 = enemyMaxHp(baseHp, atkLv11, wave, strength);
const ticks = (hp, atk) => Math.ceil(hp / atk);
const t1 = ticks(hpLv1, atkLv1), t2 = ticks(hpLv11, atkLv11);
assert('升级不会让击杀变慢（旧公式乘 level 会越升越难）', t2 <= t1, `Lv1 ${t1}s → Lv11 ${t2}s`);
const oldHpLv11 = Math.floor((baseHp + atkLv11 * 0.5) * 11 * strength); // 旧公式：血量 × 主角等级
assert('新公式去掉等级惩罚（Lv11 敌人血量远低于旧公式）', oldHpLv11 > hpLv11 * 4,
  `新 ${hpLv11} vs 旧 ${oldHpLv11}`);
assert('HP 随队伍攻击按 0.5 系数缩放',
  enemyMaxHp(baseHp, 100, 1, 1) - enemyMaxHp(baseHp, 98, 1, 1) === Math.floor(2 * HP_ATK_COEF));
assert('关底波有额外压力', near(wavePressure(10), ELITE_PRESSURE));
assert('教主波压力更高', near(wavePressure(30), BOSS_PRESSURE) && BOSS_PRESSURE > ELITE_PRESSURE);
assert('普通波无额外压力', near(wavePressure(9), 1));
const hpAt = w => enemyMaxHp(baseHp, 100, w, 1);
assert('波10 关底血量高于波9', hpAt(10) > hpAt(9));
assert('波30 教主血量高于波29', hpAt(30) > hpAt(29));

// —— 6. 奖励与文案 ——
console.log('\n=== 奖励与文案 ===');
let rewardMonotone = true;
for (let w = 2; w <= 500; w++) {
  if (waveReward(10000, w).gold < waveReward(10000, w - 1).gold) rewardMonotone = false;
}
assert('奖励倍率随波次不下降', rewardMonotone);
assert('无尽梯队奖励 ×2.8', waveReward(10000, 200).gold > waveReward(10000, 5).gold * 2.5);
assert('血条文案含梯队名', stageLabel(45).includes('长老·镇灵'));
assert('关底文案带【关底】', stageLabel(20).includes('【关底】'));
assert('教主文案带【教主】', stageLabel(30).includes('【教主】'));
assert('下一梯队提示正确', nextStageAt(1)?.name === '内门·蚀阵' && nextStageAt(1)?.wave === 11);
assert('无尽阶段无下一梯队', nextStageAt(200) === null);
assert('梯队序号可用于跨档播报', stageIndexForWave(10) === 0 && stageIndexForWave(11) === 1);

// —— 7. 典型耗时（防止某档过肉卡死）——
console.log('\n=== 典型击杀耗时（1 tick = 1s）===');
function secs(atk, w, strength) {
  return ticks(enemyMaxHp(baseHp, atk, w, strength), atk);
}
const early = secs(10, 1, 1);
const boss30 = secs(10 + 60, 30, 3.5);
const late = secs(10 + 300, 100, 1.6);
console.log(`  INFO  新手(仅主角) 波1 ≈ ${early}s；中期(队伍60攻) 波30教主 ≈ ${boss30}s；后期(队伍300攻) 波100 ≈ ${late}s`);
assert('新手第 1 波 ≤ 15s', early <= 15, `${early}s`);
assert('中期教主波 ≤ 90s', boss30 <= 90, `${boss30}s`);
assert('后期波 100 ≤ 60s', late <= 60, `${late}s`);

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
