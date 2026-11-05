// 战斗难度梯队端到端验证：种档到指定波次 → 检查血条梯队文案 / 敌方编队人数 / 波次存档。
// 用法: node tools/verify_battle_tiers.mjs [url]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const PORT = 9228;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_tiers_' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${PROFILE}`, '--disable-gpu', '--window-size=750,1334', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = { gold: 500, tickets: 1, cores: 0, level: 1, team: [], prog: {}, collection: {}, idleMult: 1 };
const CASES = [
  { name: '波10 关底（外门·试炼）', seed: { ...BASE, wave: 10 }, wants: ['第 10 波', '外门·试炼', '【关底】'], enemies: 3 },
  { name: '波30 教主（内门·蚀阵）', seed: { ...BASE, wave: 30 }, wants: ['第 30 波', '内门·蚀阵', '【教主】'], enemies: 1, shot: 'tools/battle_tier_boss.png' },
  { name: '波31 跨梯队（长老·镇灵）', seed: { ...BASE, wave: 31 }, wants: ['第 31 波', '长老·镇灵'], enemies: 3, shot: 'tools/battle_tier_elder.png' },
  { name: '波101 无尽·深渊', seed: { ...BASE, wave: 101 }, wants: ['第 101 波', '无尽·深渊'], enemies: 3 },
];

let pass = 0, fail = 0;
function assert(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

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

  const collect = `(()=>{let hp='',enemies=0,log='';const walk=(n)=>{if(n.name==='enemyRow'){let c=0;const w2=(m)=>{if(m.name==='spirit')c++;m.children.forEach(w2);};w2(n);enemies=c;}if(n.name==='label'){const s=(n.getComponent('cc.Label')||{}).string||'';if(s.startsWith('敌方 ·'))hp=s;if(s.includes('挂机战斗中')||s.includes('出现')||s.includes('进入'))log=s;}n.children.forEach(walk);};walk(window.__ui);return JSON.stringify({hp,enemies,log});})()`;

  for (const c of CASES) {
    console.log(`\n=== ${c.name} ===`);
    await send('Page.navigate', { url: TARGET });
    await sleep(7000);
    await evaluate(`localStorage.setItem('ylsz_save', JSON.stringify(${JSON.stringify(c.seed)})); 'SEEDED'`);
    await send('Page.reload');
    for (let i = 0; i < 40; i++) {
      await sleep(1500);
      if ((await evaluate('!!(window.__ui && window.cc && window.cc.resources)')) === true) break;
    }
    await sleep(1500); // 等立绘加载
    const raw = await evaluate(collect);
    const d = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {};
    console.log(`  hp="${d.hp}" enemies=${d.enemies} log="${(d.log || '').slice(0, 90)}"`);
    for (const w of c.wants) assert(`血条含「${w}」`, (d.hp || '').includes(w));
    assert(`敌方编队 ${c.enemies} 人`, d.enemies === c.enemies, `实际 ${d.enemies}`);
    const savedWave = await evaluate(`JSON.parse(localStorage.getItem('ylsz_save')||'{}').wave`);
    assert('存档波次与种档一致', savedWave === c.seed.wave, `存档 ${savedWave}`);
    if (c.shot) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(c.shot, Buffer.from(shot.data, 'base64'));
      console.log(`  SAVED ${c.shot}`);
    }
  }

  // —— 波次推进 + 持久化 ——
  console.log('\n=== 波次推进与存档 ===');
  const fast = { ...BASE, wave: 1, team: ['shou', 'lu3'],
    prog: { shou: { star: 1, evo: 2 }, lu3: { star: 1, evo: 2 } },
    collection: { shou: 1, lu3: 1 } };
  await send('Page.navigate', { url: TARGET });
  await sleep(7000);
  await evaluate(`localStorage.setItem('ylsz_save', JSON.stringify(${JSON.stringify(fast)})); 'SEEDED'`);
  await send('Page.reload');
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    if ((await evaluate('!!(window.__ui && window.cc && window.cc.resources)')) === true) break;
  }
  await sleep(9000); // 强队伍 1 tick 一波，足够推过若干波
  const waveInSave = await evaluate(`JSON.parse(localStorage.getItem('ylsz_save')||'{}').wave`);
  const raw2 = await evaluate(collect);
  const d2 = typeof raw2 === 'string' && raw2.startsWith('{') ? JSON.parse(raw2) : {};
  console.log(`  存档 wave=${waveInSave}，血条="${d2.hp}"`);
  assert('战斗自动推波（wave > 1）', Number(waveInSave) > 1, `${waveInSave}`);
  assert('血条波次与存档一致', (d2.hp || '').includes(`第 ${waveInSave} 波`));
  assert('波次写入存档（切页/重开不回退）', Number(waveInSave) === Number((d2.hp || '').match(/第 (\d+) 波/)?.[1]));

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
  ws.close();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('VERIFY ERROR:', e); process.exit(1); });
