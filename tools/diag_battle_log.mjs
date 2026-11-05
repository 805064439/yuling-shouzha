// 战斗页日志诊断：读 logLabel 内容 + 收集异常。
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const chrome = spawn('C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9228', '--no-first-run', '--user-data-dir=' + path.join(os.tmpdir(), 'cd_diag_' + Date.now()), '--disable-gpu', '--window-size=750,1334', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = { exceptions: [] };

(async () => {
  for (let i = 0; i < 20; i++) { try { if ((await fetch('http://127.0.0.1:9228/json/version')).ok) break; } catch {} await sleep(500); }
  const targets = await (await fetch('http://127.0.0.1:9228/json')).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') list.exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  await new Promise((r) => ws.addEventListener('open', () => r()));
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8088/' });
  await sleep(10000);
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.exceptionDetails ? 'EXC:' + (r.exceptionDetails.exception?.description || '') : r.result?.value; };
  await ev(`localStorage.setItem('ylsz_save', JSON.stringify({collection:{cao:3,lu:3,ying:5,hua:2},gold:1200,tickets:2,cores:8,team:['cao','lu','ying','hua']})); 'S'`);
  await send('Page.reload');
  await sleep(14000);
  const log = await ev(`(()=>{let out=null;const walk=(n)=>{if(out)return;if(n.name==='label'){const l=n.getComponent('cc.Label');if(l&&(l.string.includes('伤害')||l.string.includes('挂机'))){const ut=n.getComponent('cc.UITransform');const wp=n.worldPosition;out=JSON.stringify({str:l.string.slice(0,60),lines:l.string.split('\\n').length,pos:[Math.round(wp.x),Math.round(wp.y)],size:[ut.contentSize.width,ut.contentSize.height],color:l.color.toHEX(),active:n.active,parent:n.parent.name});return;}}n.children.forEach(walk);};walk(window.__ui);return out;})()`);
  console.log('logLabel:', log);
  console.log('exceptions:', list.exceptions.slice(0, 3).join(' || ') || '(none)');
  process.exit(0);
})();
