// R7 程序侧回归（R8 清单）：无头 CDP 检查三层总血条、血条高度、状态栏、立绘占位，并出图。
// 用法: node tools/verify_r7.mjs [url] [saveJson] [outPng]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const SAVE = process.argv[3] || 'tools/save_rush.json';
const OUT = process.argv[4] || 'tools/r7/r7_w3.png';
const PORT = 9232;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_r7_' + Date.now());
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
  const info=(n)=>{if(!n)return null;const sp=spOf(n),ut=utOf(n);return {
    sf:sp&&sp.spriteFrame?(sp.spriteFrame.name||'anon'):'NONE',type:sp?sp.type:-1,
    w:ut?Number(ut.width.toFixed(1)):-1,h:ut?Number(ut.height.toFixed(1)):-1,
    x:Number(n.position.x.toFixed(1)),y:Number(n.position.y.toFixed(1)),z:n.position.z,
    active:n.active};};
  const bg=find(ui,'ui_bar_hp_bg')[0];
  const deco=find(ui,'ui_bar_hp_deco')[0];
  const hpFills=find(ui,'ui_bar_hp_fill').concat(find(ui,'ui_bar_hp_fill_gold')).map(info);
  const unitFills=find(ui,'unitHpFill').map((n)=>{
    const sp=spOf(n),ut=utOf(n);
    const sib=n.parent.children.find(c=>c.name==='unitHpTrack');
    const tut=sib?utOf(sib):null;
    return {h:ut?Number(ut.height.toFixed(1)):-1,trackH:tut?Number(tut.height.toFixed(1)):-1,
      type:sp?sp.type:-1,fillRange:sp?Number(sp.fillRange.toFixed(3)):-1,
      sf:sp&&sp.spriteFrame?(sp.spriteFrame.name||'anon'):'NONE'};
  });
  const spirits=find(ui,'spirit').map((n)=>{
    const ut=utOf(n);const pic=n.children.find(c=>c.name==='pic');const put=pic?utOf(pic):null;
    return {ratio:ut&&put?Number((put.width/ut.width).toFixed(3)):-1,
      y:Number(n.position.y.toFixed(1)),hasMask:!!n.getComponent('cc.Mask')};
  });
  const status=find(ui,'panel_status')[0];
  return {
    hpBg:info(bg),hpDeco:info(deco),hpFills:hpFills,
    unitFills:unitFills,spirits:spirits,
    status:info(status),
    resNumPlates:find(ui,'resNumPlate').length,
    waveBadge:find(ui,'button_wave').length,
    nav:find(ui,'btn').length,
    unitChips:find(ui,'unitHpChip').length,
    masksActive:find(ui,'unitDeadMask').filter(n=>n.active).length
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
  fs.writeFileSync(path.join(path.dirname(OUT), path.basename(OUT, '.png') + '_probe.json'),
    JSON.stringify({ samples, errors }, null, 2));

  console.log('==== R7 PROBE ====');
  console.log('hpBg:', JSON.stringify(last.hpBg));
  console.log('hpDeco:', JSON.stringify(last.hpDeco));
  console.log('hpFills:', JSON.stringify(last.hpFills));
  console.log('status:', JSON.stringify(last.status));
  console.log('unitFills(h/trackH/type/range):', last.unitFills.map((f) =>
    f.h + '/' + f.trackH + '/' + f.type + '/' + f.fillRange).join(' | '));
  console.log('spirit 宽比:', last.spirits.map((s) => s.ratio).join(','),
    ' 带 Mask:', last.spirits.filter((s) => s.hasMask).length);
  // 满血/残血两态金饰必须恒定
  const decoKeys = samples.map((s) => s.hpDeco ? JSON.stringify(s.hpDeco) : 'NONE');
  const decoStable = decoKeys.every((k) => k === decoKeys[0]);
  const fillWs = samples.map((s) => s.hpFills.map((f) => f.w).join('/'));
  console.log('金饰两态恒定:', decoStable, ' 总血条 fill 宽采样:', fillWs.join(' | '));
  console.log('resNumPlates=' + last.resNumPlates + ' nav=' + last.nav +
    ' badges=' + last.waveBadge + ' chips=' + last.unitChips +
    ' masksActive=' + last.masksActive);
  const bad = [];
  if (!last.hpBg || last.hpBg.sf !== 'hp_total_bg') bad.push('hpBg 资源名错');
  if (!last.hpDeco || last.hpDeco.sf !== 'hp_total_deco' || last.hpDeco.z !== 2) bad.push('hpDeco 资源/z 错');
  if (!decoStable) bad.push('金饰随血量变化');
  if (last.unitFills.some((f) => f.type !== 3)) bad.push('单位 fill 非 FILLED');
  if (last.spirits.some((s) => s.hasMask)) bad.push('立绘仍被裁剪');
  console.log('断言失败:', bad.length ? bad.join(' / ') : '无');
  console.log('JS 异常:', errors.length + (errors.length ? ' -> ' + errors.slice(0, 3).join(' | ') : ''));

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('screenshot:', OUT);
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
