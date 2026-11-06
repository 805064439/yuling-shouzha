// 验证假设：active=false → true 循环能让 Graphics→Sprite 切换后的节点恢复渲染
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = 9391;
const CHROME = ['C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), 'cdrt_' + Date.now());
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${PROFILE}`, '--disable-gpu', '--window-size=750,1334', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 30; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {} await sleep(500); }
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', () => r()));
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true }); return r.exceptionDetails ? 'EXC:' + r.exceptionDetails.text : r.result?.value; };
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8088/' }); await sleep(7000);
for (let i = 0; i < 45; i++) { await sleep(1000); if ((await ev('!!(window.__ui&&window.cc&&window.cc.resources)')) === true) break; }
await sleep(2500);
const r1 = await ev(`(()=>{
  const ui=window.__ui;
  let stage=null;
  const walk=n=>{if(!stage&&n.name==='spiritStage'&&n.parent&&n.parent.name==='enemyRow')stage=n;n.children.forEach(walk)};
  walk(ui);
  if(!stage)return 'NO_STAGE';
  stage.children.forEach(c=>{if(c.name==='spirit'||c.name==='tint')c.active=false});
  // 对 bar/chip 做 active 循环
  const hit=[];
  stage.children.forEach(c=>{
    if(c.name==='unitHpBar'||c.name==='unitHpChip'){
      c.active=false;
      setTimeout(()=>{ if(c.isValid) c.active=true; },60);
      hit.push(c.name);
    }
  });
  return 'CYCLED:'+hit.join(',');
})()`);
console.log(r1);
await sleep(1200);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('tools/probe_reactive.png', Buffer.from(shot.data, 'base64'));
console.log('SAVED tools/probe_reactive.png');
process.exit(0);
