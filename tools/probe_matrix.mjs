// 矩阵实验：交换 mask 与 chip/bar 的 spriteFrame，定位问题在 sf 还是节点
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = 9401;
const CHROME = ['C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), 'cdmx_' + Date.now());
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
// 选一个敌人未死的 stage（mask active=false 的不行，要能显示的）——用主角 stage：mask active=false。
// 改用第一个敌方 stage：把 mask 设为 active 并显示在卡上方，同时：
//   bar.sf  <- mask.sf  （D：若渲染 → bar 节点没问题，是 bar 的 sf 问题）
//   mask.sf <- chip.sf  （E：mask 节点换 chip 的 sf，若不渲染 → chip sf 有问题）
//   mask 保持 active=true、位置不变；立绘/tint 隐藏
const r1 = await ev(`(()=>{
  const ui=window.__ui;
  let stage=null,bar=null,chip=null,mask=null;
  const walk=n=>{
    if(!stage&&n.name==='spiritStage'&&n.parent&&n.parent.name==='enemyRow')stage=n;
    if(!bar&&n.name==='unitHpBar')bar=n;
    if(!chip&&n.name==='unitHpChip')chip=n;
    if(!mask&&n.name==='unitDeadMask')mask=n;
    n.children.forEach(walk);
  };
  walk(ui);
  if(!stage||!bar||!chip||!mask)return 'MISS:'+!!stage+!!bar+!!chip+!!mask;
  stage.children.forEach(c=>{if(c.name==='spirit'||c.name==='tint')c.active=false});
  const sfBar=bar.getComponent('cc.Sprite').spriteFrame;
  const sfChip=chip.getComponent('cc.Sprite').spriteFrame;
  const sfMask=mask.getComponent('cc.Sprite').spriteFrame;
  bar.getComponent('cc.Sprite').spriteFrame=sfMask;      // D
  chip.getComponent('cc.Sprite').spriteFrame=sfMask;     // D2
  mask.active=true;
  mask.getComponent('cc.Sprite').spriteFrame=sfChip;     // E
  return 'SWAPPED sfBar='+sfBar.name+' sfChip='+sfChip.name+' sfMask='+sfMask.name;
})()`);
console.log(r1);
await sleep(1200);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('tools/probe_matrix.png', Buffer.from(shot.data, 'base64'));
console.log('SAVED tools/probe_matrix.png');
process.exit(0);
