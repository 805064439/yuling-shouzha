// 战斗梯队端到端验证：种档到指定波次 → 检查血条梯队文案 / 敌方编队 / 每单位独立血条数 / 波次存档。
// 通过 CDP 注入把 1s 战斗计时器冻结成 10 分钟，避免验证期间波次自然推进导致断言抖动。
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

const BASE = { gold: 500, tickets: 1, cores: 0, level: 5, team: [], prog: {}, collection: {}, idleMult: 1, bestWave: 110 };
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
  // 冻结 1s 战斗计时器（Cocos 主循环用 rAF，不受影响）
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){const o=window.setInterval;window.setInterval=function(f,ms){return o.call(window,f,ms===1000?600000:ms);};})();`,
  });

  const collect = `(()=>{let hp='',enemies=0,bars=0,nums=[],info='',progress='';const walk=(n)=>{if(n.name==='enemyRow'){const w2=(m)=>{if(m.name==='spirit')enemies++;m.children.forEach(w2);};n.children.forEach(w2);}if(n.name==='unitHpBar')bars++;if(n.name==='unitHpNum'){const s=(n.getComponent('cc.Label')||{}).string||'';if(s)nums.push(s);}if(n.name==='label'){const s=(n.getComponent('cc.Label')||{}).string||'';if(s.startsWith('敌方 ·'))hp=s;if(s.includes('主角 Lv.'))info=s;if(s.includes('本关击杀'))progress=s;}n.children.forEach(walk);};walk(window.__ui);return JSON.stringify({hp,enemies,bars,nums,info,progress});})()`;

  for (const c of CASES) {
    console.log(`\n=== ${c.name} ===`);
    await send('Page.navigate', { url: TARGET });
    await sleep(7000);
    await evaluate(`localStorage.setItem('ylsz_save', JSON.stringify(${JSON.stringify(c.seed)})); 'SEEDED'`);
    await send('Page.reload');
    for (let i = 0; i < 40; i++) {
      await sleep(1000);
      if ((await evaluate('!!(window.__ui && window.cc && window.cc.resources)')) === true) break;
    }
    await sleep(1800); // 等立绘异步加载
    const raw = await evaluate(collect);
    const d = typeof raw === 'string' && raw.startsWith('{') ? JSON.parse(raw) : {};
    console.log(`  hp="${d.hp}" enemies=${d.enemies} bars=${d.bars} nums=${(d.nums || []).slice(0, 4).join('|')}`);
    for (const w of c.wants) assert(`血条含「${w}」`, (d.hp || '').includes(w));
    assert(`敌方编队 ${c.enemies} 人`, d.enemies === c.enemies, `实际 ${d.enemies}`);
    assert(`独立血条 ${c.enemies + 1} 条（${c.enemies} 敌 + 1 主角）`, d.bars === c.enemies + 1, `实际 ${d.bars}`);
    assert('血条上有血量数字', (d.nums || []).some(s => /\d+\/\d+/.test(s)), JSON.stringify(d.nums));
    assert('顶部信息与本关进度已渲染', /主角 Lv\./.test(d.info || '') && /本关击杀/.test(d.progress || ''));
    const savedWave = await evaluate(`JSON.parse(localStorage.getItem('ylsz_save')||'{}').wave`);
    assert('存档波次与种档一致（重开不回退）', savedWave === c.seed.wave, `存档 ${savedWave}`);
    if (c.shot) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(c.shot, Buffer.from(shot.data, 'base64'));
      console.log(`  SAVED ${c.shot}`);
    }
  }

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
  ws.close();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('VERIFY ERROR:', e); process.exit(1); });
