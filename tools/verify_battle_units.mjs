// 单位制战斗端到端验证：真实跑战斗计时器（不冻结），验证
//   1) 每个敌方/我方单位都有独立血条与血量数字；2) 每只击杀即时掉落并落盘；
//   3) 一只怪都打不死时退回上一关、历史最高不回退。
// 用法: node tools/verify_battle_units.mjs [url]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const PORT = 9229;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_units_' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${PROFILE}`, '--disable-gpu', '--window-size=750,1334', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

const collect = `(()=>{let bars=0,nums=[],info='',progress='',log='',hp='',dead=0;const sw=(()=>{try{return JSON.parse(localStorage.getItem('ylsz_save')||'{}').wave}catch(e){return null}})();const walk=(n)=>{if(n.name==='unitHpBar')bars++;if(n.name==='unitHpNum'){const s=(n.getComponent('cc.Label')||{}).string||'';if(s)nums.push(s);if(s==='已击败'||s==='倒下')dead++;}if(n.name==='unitDeadMask'&&n.active)dead++;if(n.name==='label'){const s=(n.getComponent('cc.Label')||{}).string||'';if(s.startsWith('敌方 ·'))hp=s;if(s.includes('主角 Lv.'))info=s;if(s.includes('本关击杀'))progress=s;if((s.includes('击杀')||s.includes('退回')||s.includes('伤害')||s.includes('出现'))&&!s.startsWith('本关击杀'))log=s;}n.children.forEach(walk);};walk(window.__ui);return JSON.stringify({bars,nums,info,progress,log,hp,dead,sw});})()`;

async function main() {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {}
    await sleep(500);
  }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  await new Promise((res) => ws.addEventListener('open', () => res()));
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) return 'EVAL_EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result ? r.result.value : 'EVAL_FAIL';
  };
  await send('Runtime.enable');
  await send('Page.enable');

  const seedAndBoot = async (seed, waitMs) => {
    await send('Page.navigate', { url: TARGET });
    await sleep(6500);
    await evaluate(`localStorage.setItem('ylsz_save', JSON.stringify(${JSON.stringify(seed)})); 'SEEDED'`);
    await send('Page.reload');
    for (let i = 0; i < 45; i++) {
      await sleep(1000);
      if ((await evaluate('!!(window.__ui && window.cc && window.cc.resources)')) === true) break;
    }
    await sleep(waitMs);
    const raw = await evaluate(collect);
    const d = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {};
    const save = await evaluate(`JSON.parse(localStorage.getItem('ylsz_save')||'{}')`);
    return { d, save };
  };

  // —— 场景 A：正常战斗，检查独立血条 + 击杀掉落 ——
  console.log('\n=== 场景 A：正常战斗（3 精灵 + 主角 vs 3 只怪）===');
  const a = await seedAndBoot({
    gold: 0, cores: 0, tickets: 1, level: 5, wave: 1, bestWave: 1,
    team: ['cao', 'ye', 'shou'],
    prog: { cao: { star: 1, evo: 0 }, ye: { star: 1, evo: 0 }, shou: { star: 1, evo: 0 } },
    collection: { cao: 1, ye: 1, shou: 1 }, idleMult: 1,
  }, 9000);
  console.log(`  bars=${a.d.bars} nums=${(a.d.nums || []).slice(0, 7).join(' | ')}`);
  console.log(`  info="${a.d.info}" progress="${a.d.progress}"`);
  console.log(`  save.wave=${a.save.wave} save.gold=${a.save.gold}`);
  assert('独立血条数 = 3 敌 + 4 我 = 7', a.d.bars === 7, `实际 ${a.d.bars}`);
  assert('每个血条都有 hp/maxHp 数字', (a.d.nums || []).length === 7
    && (a.d.nums || []).every(s => /\d+\/\d+/.test(s) || s === '已击败' || s === '倒下'),
  JSON.stringify(a.d.nums));
  assert('我方与敌方血量数值不同（各自独立）',
    new Set((a.d.nums || []).filter(s => /\//.test(s)).map(s => s.split('/')[1])).size >= 2,
    JSON.stringify(a.d.nums));
  assert('顶部灵气随击杀实时增加', /灵气 [1-9]\d*/.test(a.d.info || ''), a.d.info);
  assert('击杀奖励已写入存档', Number(a.save.gold) > 0, `gold=${a.save.gold}`);
  assert('本关击杀进度已显示', /本关击杀 \d+\/\d+/.test(a.d.progress || ''), a.d.progress);
  assert('战斗日志有伤害/击杀记录', /伤害|击杀|出现/.test(a.d.log || ''), a.d.log);
  assert('波次已推进（全清进下一关）', Number(a.save.wave) > 1, `wave=${a.save.wave}`);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('tools/battle_units.png', Buffer.from(shot.data, 'base64'));
  console.log('  SAVED tools/battle_units.png');

  // —— 场景 B：远超出能力的关卡 → 0 击杀退回上一关 ——
  console.log('\n=== 场景 B：高关 0 击杀退关 ===');
  const b = await seedAndBoot({
    gold: 0, cores: 0, tickets: 0, level: 1, wave: 200, bestWave: 200,
    team: [], prog: {}, collection: {}, idleMult: 1,
  }, 7000);
  console.log(`  log="${(b.d.log || '').slice(0, 160)}"`);
  console.log(`  save.wave=${b.save.wave} bestWave=${b.save.bestWave} info="${b.d.info}"`);
  assert('出现「退回上一关」播报', /退回/.test(b.d.log || ''), b.d.log);
  assert('存档波次确实下降', Number(b.save.wave) < 200, `wave=${b.save.wave}`);
  assert('历史最高波次不随退关下降', Number(b.save.bestWave) === 200, `best=${b.save.bestWave}`);
  // sw 与 hp 在同一次页面求值里取得，避免两次求值之间又过一 tick 造成竞态
  assert('血条文案跟随退回后的波次', (b.d.hp || '').includes(`第 ${b.d.sw} 波`),
    `hp="${b.d.hp}" saved=${b.d.sw}`);
  assert('顶部仍显示历史最高 200 波', /最高 200 波/.test(b.d.info || ''), b.d.info);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('tools/battle_regress.png', Buffer.from(shot.data, 'base64'));
  console.log('  SAVED tools/battle_regress.png');

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
  ws.close();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('VERIFY ERROR:', e); process.exit(1); });
