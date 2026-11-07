// R6 程序侧回归：无头 CDP 读取单位血条 FILLED 属性、空槽、立绘占位几何，并出图。
// 用法: node tools/verify_r6.mjs [url] [saveJson] [outPng]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const SAVE = process.argv[3] || 'tools/save140.json';
const OUT = process.argv[4] || 'tools/r6/r6_full.png';
const PORT = 9231;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_r6_' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + PROFILE, '--disable-gpu',
  '--window-size=750,1334', '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitCdp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('CDP 端口等待超时');
}

const PROBE = `(()=>{
  const find=(root,name)=>{const out=[];const walk=(n)=>{if(n.name===name)out.push(n);for(const c of n.children)walk(c);};walk(root);return out;};
  const ui=window.__ui;
  if(!ui||ui.children.length===0)return {error:'NO_UI'};
  const utOf=(n)=>n.getComponent('cc.UITransform');
  const spOf=(n)=>n.getComponent('cc.Sprite');
  const chipText=(n)=>{const c=find(n,'unitHpNum')[0];const l=c&&c.getComponent('cc.Label');return l?l.string:'';};
  const fills=find(ui,'unitHpFill').map((n)=>{
    const sp=spOf(n),ut=utOf(n);
    return {name:n.name,active:n.active,type:sp?sp.type:-1,
      fillType:sp?sp.fillType:-1,fillStart:sp?sp.fillStart:-1,
      fillRange:sp?Number(sp.fillRange.toFixed(4)):-1,
      w:ut?Number(ut.width.toFixed(1)):-1,h:ut?Number(ut.height.toFixed(1)):-1,
      sf:sp&&sp.spriteFrame?(sp.spriteFrame.name||'anon'):'NONE',
      hp:chipText(n.parent)};
  });
  const tracks=find(ui,'unitHpTrack').map((n)=>{
    const sp=spOf(n),ut=utOf(n);
    return {active:n.active,sf:sp&&sp.spriteFrame?(sp.spriteFrame.name||'anon'):'NONE',
      type:sp?sp.type:-1,w:ut?Number(ut.width.toFixed(1)):-1,h:ut?Number(ut.height.toFixed(1)):-1};
  });
  const spirits=find(ui,'spirit').map((n)=>{
    const ut=utOf(n);const pic=n.children.find(c=>c.name==='pic');
    const put=pic?utOf(pic):null;
    const mask=n.getComponent('cc.Mask');
    return {y:Number(n.position.y.toFixed(1)),w:ut?Number(ut.width.toFixed(1)):-1,
      h:ut?Number(ut.height.toFixed(1)):-1,
      picW:put?Number(put.width.toFixed(1)):-1,picH:put?Number(put.height.toFixed(1)):-1,
      hasMask:!!mask,card:n.parent?n.parent.name:''};
  });
  const hpbg=find(ui,'ui_bar_hp_bg')[0];
  const hpFill=find(ui,'ui_bar_hp_fill')[0];
  return {
    fills:fills, tracks:tracks, spirits:spirits,
    chips:find(ui,'unitHpChip').length,
    masksActive:find(ui,'unitDeadMask').filter(n=>n.active).length,
    resNumPlates:find(ui,'resNumPlate').length,
    logPanel:find(ui,'panel_jade_large').length,
    hpBgType:hpbg&&spOf(hpbg)?spOf(hpbg).type:-1,
    hpBgSize:hpbg&&utOf(hpbg)?utOf(hpbg).width.toFixed(0)+'x'+utOf(hpbg).height.toFixed(0):'',
    totalFillW:hpFill&&utOf(hpFill)?Number(utOf(hpFill).width.toFixed(1)):-1,
    nav:find(ui,'btn').length
  };
})()`;

async function main() {
  await waitCdp();
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(String(m.params.entry.text));
  });
  await new Promise((res) => ws.addEventListener('open', () => res()));
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: TARGET });
  await sleep(2500);
  const save = fs.readFileSync(SAVE, 'utf8');
  await send('Runtime.evaluate', {
    expression: "localStorage.setItem('ylsz_save', " + JSON.stringify(save) + "); 'ok'",
    returnByValue: true,
  });
  await send('Page.reload');

  let booted = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const r = await send('Runtime.evaluate', {
      expression: '!!(window.__ui && window.__ui.children.length > 0)', returnByValue: true,
    });
    if (r.result && r.result.value) { booted = true; break; }
  }
  console.log('booted:', booted);
  if (!booted) throw new Error('页面未启动');
  await sleep(6000);

  const samples = [];
  for (let k = 0; k < 4; k++) {
    const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    samples.push(r.result && r.result.value);
    await sleep(1800);
  }
  const last = samples[samples.length - 1];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(OUT), 'r6_probe.json'),
    JSON.stringify({ samples, errors }, null, 2));

  console.log('==== R6 PROBE (last sample) ====');
  console.log('fills=' + last.fills.length + ' tracks=' + last.tracks.length +
    ' spirits=' + last.spirits.length + ' chips=' + last.chips +
    ' masksActive=' + last.masksActive + ' resNumPlates=' + last.resNumPlates +
    ' nav=' + last.nav + ' hpBg=' + last.hpBgSize + ' totalFillW=' + last.totalFillW);
  const badType = last.fills.filter((f) => f.type !== 3);
  const badTrack = last.tracks.filter((t) => t.sf !== 'bar_track_dark');
  const masked = last.spirits.filter((s) => s.hasMask);
  console.log('FILLED type!=3: ' + badType.length + ' / track 未加载: ' + badTrack.length +
    ' / spirit 仍带 Mask: ' + masked.length);
  console.log('fillRange 样本: ' + samples.map((s) =>
    s.fills.map((f) => f.fillRange.toFixed(2)).join(',')).join(' | '));
  console.log('立绘 pic/内窗 宽比: ' + last.spirits.map((s) =>
    (s.picW / s.w).toFixed(2)).join(','));
  console.log('JS 异常: ' + errors.length + (errors.length ? ' -> ' + errors.slice(0, 3).join(' | ') : ''));

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('screenshot: ' + OUT);
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
