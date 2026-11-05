// 编队页初生立绘「视觉尺寸一致性」端到端验证 + 截图。
// 仅用 Node 22 内置 WebSocket + fetch，无需 npm 依赖。
// 用法: node tools/verify_team_fit.mjs [url] [out.png]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const OUT = process.argv[3] || 'tools/team_fit.png';
const PORT = 9227;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_team_' + Date.now());
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
   `--user-data-dir=${PROFILE}`, '--disable-gpu', '--window-size=750,1334', '--hide-scrollbars', 'about:blank'],
  { stdio: 'ignore' },
);
process.on('exit', () => { try { chrome.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 与 widgets.ts 的 INITIAL_BBOX 保持一致（归一化后 640×960 画布内 alpha>16 主体包围盒）
const BBOX = {
  cao: [614, 718], lu: [617, 655], ye: [588, 915], hua: [615, 664], rong: [615, 532],
  ying: [615, 710], tai: [615, 627], luling: [615, 699], shou: [617, 813], lu3: [561, 913],
};
const NAME2ID = {
  草灵: 'cao', 露珠精: 'lu', 叶灵: 'ye', 花灵: 'hua', 绒灵: 'rong',
  萤火灵: 'ying', 苔灵: 'tai', 露灵: 'luling', 守脉灵: 'shou', 月华灵鹿: 'lu3',
};
const SEED = JSON.stringify({
  collection: { cao: 1, lu: 1, ye: 1, hua: 1, rong: 1, ying: 1, tai: 1, luling: 1, shou: 1, lu3: 1 },
  gold: 500, tickets: 1, prog: {}, team: [],
});

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
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
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
  await send('Page.navigate', { url: TARGET });
  await sleep(9000);
  await evaluate(`localStorage.setItem('ylsz_save', JSON.stringify(${SEED})); 'SEEDED'`);
  await send('Page.reload');
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    if ((await evaluate('!!(window.__ui && window.cc && window.cc.resources)')) === true) break;
  }
  await sleep(1500);
  // 进编队页
  const nav = await evaluate(`(()=>{let hit=false;const walk=(n)=>{if(hit)return;if(n.name==='btn'&&n.getComponent('cc.Button')){const lab=n.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string.includes('编队出战')){n.emit('click');hit=true;return;}}}n.children.forEach(walk);};walk(window.__ui);return hit?'OK':'NOT_FOUND';})()`);
  console.log('NAV', nav);
  // 等 10 张立绘全部加载
  let ready = 0;
  for (let i = 0; i < 30; i++) {
    ready = await evaluate(`(()=>{let c=0;const walk=(n)=>{if(n.name==='spirit'){const p=n.children.find(x=>x.name==='pic');if(p&&p.getComponent('cc.Sprite')?.spriteFrame)c++;}n.children.forEach(walk);};walk(window.__ui);return c;})()`);
    if (ready >= 10) break;
    await sleep(1500);
  }
  console.log('SPRITES_READY', ready);
  await sleep(1200);
  const rows = await evaluate(`(()=>{const out=[];const walk=(n)=>{if(n.name==='spirit'){const p=n.children.find(x=>x.name==='pic');const ut=p?.getComponent('cc.UITransform');const sf=p?.getComponent('cc.Sprite')?.spriteFrame;const card=n.parent;const lab=card?.children.find(x=>x.name==='label');const nm=lab?.getComponent('cc.Label')?.string||'';out.push({name:nm,w:ut?.width||0,h:ut?.height||0,tex:sf?.texture?.name||'',fw:sf?.width||0,fh:sf?.height||0});}n.children.forEach(walk);};walk(window.__ui);return JSON.stringify(out);})()`);
  const data = typeof rows === 'string' && rows.startsWith('[') ? JSON.parse(rows) : [];
  console.log('CARDS', data.length);
  let min = Infinity, max = 0, minRaw = Infinity, maxRaw = 0;
  for (const d of data) {
    const sid = NAME2ID[d.name];
    const bb = BBOX[sid];
    if (!bb) { console.log(`  ${d.name}: 未映射 id（tex=${d.tex}）`); continue; }
    const sw = d.w * bb[0] / 640;
    const sh = d.h * bb[1] / 960;
    const area = sw * sh;
    // 未补偿时的基准（外框 150×150 → contain 后 pic 恒为 100×150）
    const rawArea = (100 * bb[0] / 640) * (150 * bb[1] / 960);
    minRaw = Math.min(minRaw, rawArea); maxRaw = Math.max(maxRaw, rawArea);
    min = Math.min(min, area); max = Math.max(max, area);
    console.log(`  ${d.name.padEnd(4)} pic=${d.w}x${d.h}  tex=${d.tex}  主体≈${sw.toFixed(0)}x${sh.toFixed(0)}  面积=${Math.round(area)}`);
  }
  const ratio = max / min;
  console.log(`AREA_MIN=${Math.round(min)} AREA_MAX=${Math.round(max)} RATIO=${ratio.toFixed(3)}`
    + ` RAW_RATIO=${(maxRaw / minRaw).toFixed(3)} (补偿前)`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('SAVED', OUT);
  ws.close();
  process.exit(data.length >= 10 && ratio < 1.25 ? 0 : 1);
}
main().catch((e) => { console.error('VERIFY ERROR:', e); process.exit(1); });
