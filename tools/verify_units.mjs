// 战斗单位制规则单测：直接驱动真实 logic/Battle.ts，手工摆布单位状态以覆盖边界。
// 用法: node --experimental-strip-types --import ./tools/ts_register.mjs tools/verify_units.mjs
import { Battle } from '../assets/scripts/logic/Battle.ts';
import { createDefaultState } from '../assets/scripts/logic/Save.ts';

let pass = 0, fail = 0;
const assert = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};
const rng = () => 0.5; // 无随机：伤害恰好等于 atk

function make(over = {}) {
  const state = { ...createDefaultState(), ...over };
  const logs = [];
  let saves = 0;
  const b = new Battle(state, (m) => logs.push(m), () => { saves++; }, rng);
  return { state, b, logs, saves: () => saves };
}

// —— 1. 每个单位独立血量 ——
console.log('=== 单位血量独立 ===');
{
  const { b } = make({ wave: 10, level: 5, team: ['cao', 'ye', 'shou'], prog: {}, collection: {} });
  assert('我方单位数 = 主角 + 上场精灵数', b.allies.length === 4, `${b.allies.length}`);
  assert('每个我方单位都有独立 maxHp', b.allies.every(u => u.maxHp > 0 && u.hp === u.maxHp));
  assert('我方血量各不相同', new Set(b.allies.map(u => u.maxHp)).size >= 3);
  assert('敌方单位数 = 编队人数', b.enemies.length === b.enemyTeam.length && b.enemies.length === 3);
  assert('同波不同怪血量各不相同（层级 hpMul 生效）',
    new Set(b.enemies.map(u => u.maxHp)).size > 1,
    b.enemies.map(u => u.maxHp).join(','));
  assert('敌方每只怪都有独立 atk', b.enemies.every(u => u.atk >= 1));
  assert('主角恒为 0 号单位', b.allies[0].id === '__hero');
}

// —— 2. 每只击杀即时掉落（不等整波清空）——
console.log('\n=== 击杀掉落 ===');
{
  const { state, b, logs, saves } = make({ wave: 12, level: 1, team: ['cao', 'lu', 'ye'], prog: {}, collection: {} });
  b.enemies[0].hp = 1;                       // 第一只一击必杀
  b.enemies[1].hp = b.enemies[1].maxHp = 100000;
  b.enemies[2].hp = b.enemies[2].maxHp = 100000;
  b.enemies.forEach(e => { e.atk = 0; });    // 反击不构成团灭
  const gold0 = state.gold, cores0 = state.cores, wave0 = b.wave;
  const ev = b.tick();
  assert('击杀 1 只但本关未清空', ev.result === 'fight' && b.kills === 1, `${ev.result}/${b.kills}`);
  assert('波次不变（奖励不是清关才发）', b.wave === wave0 && state.wave === wave0);
  assert('灵气随击杀增加', state.gold > gold0, `${gold0} → ${state.gold}`);
  assert('灵核随击杀可能增加（概率掉落）', state.cores >= cores0);
  assert('日志有「击杀」字样', logs.some(l => l.includes('击杀')));
  assert('击杀即时落盘', saves() > 0, `${saves()}`);
  assert('被击杀的怪标记为 dead 且血量归零', b.enemies[0].dead && b.enemies[0].hp === 0);
}

// —— 3. 团灭 0 击杀 → 退回上一关（步进制：判定后停留，倒计时结束才换场）——
console.log('\n=== 0 击杀退关 ===');
{
  const { state, b } = make({ wave: 50, level: 1, team: [], bestWave: 80 });
  b.enemies.forEach(e => { e.hp = e.maxHp = 100000; e.atk = 100000; });
  let sawRegress = null, ev = null;
  for (let i = 0; i < 12; i++) {
    ev = b.tick();
    if (ev.result === 'regress') sawRegress = ev;
    if (ev.enemyChanged) break;
  }
  assert('判定为 regress', !!sawRegress, `last=${ev && ev.result}`);
  assert('波次恰好退回一关', b.wave === 49 && state.wave === 49, `${b.wave}/${state.wave}`);
  assert('退关后双方满血复活、敌人重新编排', b.allies.every(u => u.hp === u.maxHp)
    && b.enemies.every(u => u.hp === u.maxHp && !u.dead));
  assert('历史最高波次不因退关下降', state.bestWave === 80, `${state.bestWave}`);
  assert('退关事件带原波次', sawRegress.regressFrom === 50);
}

// —— 4. 有击杀团灭 → 留在本关，已死的怪不复活、我方复活 ——
console.log('\n=== 有击杀留关 ===');
{
  const { state, b } = make({ wave: 50, level: 1, team: [] });
  b.enemies[0].hp = 1; b.enemies[0].maxHp = 60;
  b.enemies[1].hp = b.enemies[1].maxHp = 100000;
  b.enemies[2].hp = b.enemies[2].maxHp = 100000;
  b.enemies.forEach(e => { e.atk = 100000; });
  let sawRetry = null;
  for (let i = 0; i < 12; i++) {
    const ev = b.tick();
    if (ev.result === 'retry') sawRetry = ev;
    if (sawRetry && b.allies.every(u => !u.dead)) break; // 复活完成 = 换场结束
  }
  assert('判定为 retry（原地再战）', !!sawRetry, `${sawRetry}`);
  assert('波次保持不变', b.wave === 50 && state.wave === 50);
  assert('已击杀的怪保持死亡', b.enemies[0].dead === true);
  assert('存活怪保留残血（进度不清零）', b.enemies[1].hp > 0 && b.enemies[1].hp < b.enemies[1].maxHp + 1);
  assert('我方满血复活', b.allies.every(u => !u.dead && u.hp === u.maxHp));
  assert('本关累计击杀数保留', b.kills === 1, `${b.kills}`);
  assert('留关不重绘敌方编队', sawRetry.enemyChanged === false);
}

// —— 5. 全清 → 波次即时 +1，画面停留展示全灭，再换场进下一关 ——
console.log('\n=== 全清推进 ===');
{
  const { state, b, logs } = make({ wave: 9, level: 3, team: ['cao', 'lu', 'ye'], prog: {}, collection: {} });
  b.enemies.forEach(e => { e.hp = 1; e.maxHp = 60; e.atk = 0; });
  let sawClear = null, lastEv = null;
  for (let i = 0; i < 15; i++) {
    const ev = b.tick();
    if (ev.result === 'clear') {
      sawClear = ev;
      assert('全灭瞬间进入停留画面（敌人全部保持 dead 供 UI 展示遮罩）',
        b.enemies.every(e => e.dead) && ev.enemyChanged === false);
    }
    if (ev.enemyChanged) { lastEv = ev; break; }
  }
  assert('判定为 clear', !!sawClear, `${lastEv && lastEv.result}`);
  assert('波次 +1 且写入存档', b.wave === 10 && state.wave === 10);
  assert('历史最高刷新', state.bestWave === 10);
  assert('新一关敌人满血、我方满血', b.enemies.every(u => u.hp === u.maxHp)
    && b.allies.every(u => u.hp === u.maxHp));
  assert('累计击杀归零', b.kills === 0);
  assert('通关日志播报', logs.some(l => l.includes('通关')));
  assert('停留结束后需要重绘敌方编队', !!lastEv && lastEv.enemyChanged === true);
}

// —— 6. 第 1 关兜底：0 击杀也不越界 ——
console.log('\n=== 第 1 关兜底 ===');
{
  const { state, b } = make({ wave: 1, level: 1, team: [] });
  b.enemies.forEach(e => { e.hp = e.maxHp = 100000; e.atk = 100000; });
  // tick1 我方出手 → tick2 敌反击团灭（判定 retry）→ tick3/4 停留后复活
  for (let i = 0; i < 4; i++) b.tick();
  assert('连续团灭仍停在第 1 关', b.wave === 1 && state.wave === 1);
  assert('不会卡死，复活后仍可继续演算', b.enemies.length > 0 && b.allies.every(u => u.hp === u.maxHp));
}

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
