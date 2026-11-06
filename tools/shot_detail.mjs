// 详情页截图：种档 → 进图鉴 → 点草灵进详情 → 截图。
// 仅用 Node 22 内置 WebSocket + fetch，无需 npm 依赖。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const OUT = process.argv[3] || 'tools/detail_shot.png';
const SEED = process.argv[4] || JSON.stringify({ collection:{cao:2,lu:1}, gold:500, tickets:1, prog:{cao:{star:1,evo:1},lu:{star:1,evo:0}} });
const CARD = process.argv[5] || '草灵'; // 要截图的精怪名
const PORT = 9226;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_shot_' + Date.now());
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${PROFILE}`, '--disable-gpu', '--window-size=750,1334', '--hide-scrollbars', 'about:blank'],
  { stdio: 'ignore' },
);
process.on('exit', () => { try { chrome.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await sleep(10000);
  await evaluate(`localStorage.setItem('ylsz_save', JSON.stringify(${SEED})); 'SEEDED'`);
  await send('Page.reload');
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    if ((await evaluate('!!(window.__ui && window.cc && window.cc.resources)')) === true) break;
  }
  await sleep(2000);
  if (CARD === '__protag__') {
    // 点战斗页导航里的「主角」按钮进主角页
    await evaluate(`(()=>{let hit=false;const walk=(n)=>{if(hit)return;if(n.name==='btn'&&n.getComponent('cc.Button')){const lab=n.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string.includes('主角')){n.emit('click');hit=true;return;}}}n.children.forEach(walk);};walk(window.__ui);return hit?'OK':'NOT_FOUND';})()`);
    await sleep(9000);
  } else if (CARD === '__enemy_dex__' || CARD.startsWith('__enemy_detail__')) {
    // 进图鉴 → 切「蚀灵教」页签 →（详情模式再点一张敌人卡）
    // 支持 '__enemy_detail__:<敌人名>' 指定任意敌人，默认教主
    const enemyName = CARD.startsWith('__enemy_detail__:')
      ? CARD.slice('__enemy_detail__:'.length) : '蚀灵教主·馁';
    await evaluate(`(()=>{const walk=(n)=>{for(const c of n.children){if(c.name==='btn'){const lab=c.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string.includes('图鉴'))c.emit('click');}}walk(c);}};walk(window.__ui);return 'OK';})()`);
    await sleep(8000);
    await evaluate(`(()=>{let hit=false;const walk=(n)=>{if(hit)return;if(n.name==='btn'&&n.getComponent('cc.Button')){const lab=n.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string.includes('蚀灵教')){n.emit('click');hit=true;return;}}}n.children.forEach(walk);};walk(window.__ui);return hit?'OK':'NOT_FOUND';})()`);
    await sleep(9000);
    if (CARD.startsWith('__enemy_detail__')) {
      await evaluate(`(()=>{let hit=false;const walk=(n)=>{if(hit)return;if(n.name==='panel'&&n.getComponent('cc.Button')){const lab=n.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string===${JSON.stringify(enemyName)}){n.emit('click');hit=true;return;}}}n.children.forEach(walk);};walk(window.__ui);return hit?'OK':'NOT_FOUND';})()`);
      await sleep(12000); // 等大立绘加载
    }
  } else if (CARD !== '__battle__') {
    await evaluate(`(()=>{const walk=(n)=>{for(const c of n.children){if(c.name==='btn'){const lab=c.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string.includes('图鉴'))c.emit('click');}}walk(c);}};walk(window.__ui);return 'OK';})()`);
    await sleep(8000);
    await evaluate(`(()=>{let hit=false;const walk=(n)=>{if(hit)return;if(n.name==='panel'&&n.getComponent('cc.Button')){const lab=n.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string==='${CARD}'){n.emit('click');hit=true;return;}}}n.children.forEach(walk);};walk(window.__ui);return hit?'OK':'NOT_FOUND';})()`);
  }
  await sleep(CARD === '__battle__' || CARD === '__enemy_dex__' ? 6000 : 12000); // 等大立绘（1-2MB）加载完成
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('SAVED', OUT);
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('SHOT ERROR:', e); process.exit(1); });
