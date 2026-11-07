// R9 程序侧回归（R8 美术评审后）：状态栏去胶囊 / 名牌下移 / 满血-残血两态金饰恒定 / fill 圆头。
// 用法: node tools/verify_r9.mjs [url] [saveJson] [outPng]
// 第3波存档 tools/save_rush.json 开局 fill≈68%（残血），第140波 tools/save140.json ≈99%（满血）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const SAVE = process.argv[3] || 'tools/save_rush.json';
const OUT = process.argv[4] || 'tools/r9/r9_lowhp.png';
const PORT = 9233;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_r9_' + Date.now());
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
  const ui=window.__ui;
  if(!ui||ui.children.length===0)return {error:'NO_UI'};
  const find=(root,fn)=>{const out=[];const walk=(n)=>{if(fn(n))out.push(n);for(const c of n.children)walk(c);};walk(root);return out;};
  const byName=(root,name)=>find(root,n=>n.name===name);
  const utOf=n=>n.getComponent('cc.UITransform');
  const spOf=n=>n.getComponent('cc.Sprite');
  const info=n=>{if(!n)return null;const sp=spOf(n),ut=utOf(n);return {
    sf:sp&&sp.spriteFrame?(sp.spriteFrame.name||'anon'):'NONE',type:sp?sp.type:-1,
    w:ut?Number(ut.width.toFixed(1)):-1,h:ut?Number(ut.height.toFixed(1)):-1,
    x:Number(n.position.x.toFixed(1)),y:Number(n.position.y.toFixed(1)),z:n.position.z,active:n.active};};
  const status=byName(ui,'panel_status')[0];
  const kids=status?status.children:[];
  const icons=kids.filter(n=>{const sp=spOf(n);return sp&&sp.spriteFrame&&/^icon_/.test(sp.spriteFrame.name||'');}).map(info);
  const nums=kids.filter(n=>!!n.getComponent('cc.Label')).map(n=>{
    const l=n.getComponent('cc.Label'),ut=utOf(n);
    const c=l.color||{};
    return {name:n.name,text:String(l.string),rgb:[c.r,c.g,c.b].join(','),
      outline:!!l.enableOutline,ow:Number(l.outlineWidth),overflow:Number(l.overflow),
      anchorX:ut&&ut.anchorPoint?Number(ut.anchorPoint.x.toFixed(2)):-1,
      w:ut?Number(ut.width.toFixed(1)):-1,x:Number(n.position.x.toFixed(1))};
  });
  const hpBg=byName(ui,'ui_bar_hp_bg')[0];
  const deco=byName(ui,'ui_bar_hp_deco')[0];
  const hpFills=byName(ui,'ui_bar_hp_fill').concat(byName(ui,'ui_bar_hp_fill_gold')).map(info);
  const tracks=byName(ui,'unitHpTrack').map(info);
  const unitFills=byName(ui,'unitHpFill').map(n=>{
    const sp=spOf(n),ut=utOf(n);
    return {h:ut?Number(ut.height.toFixed(1)):-1,w:ut?Number(ut.width.toFixed(1)):-1,
      type:sp?sp.type:-1,fillRange:sp?Number(sp.fillRange.toFixed(3)):-1,
      sf:sp&&sp.spriteFrame?(sp.spriteFrame.name||'anon'):'NONE',
      active:n.active,y:Number(n.position.y.toFixed(1))};
  });
  const plates=find(ui,n=>/^plate_name_/.test(n.name)).map(info);
  const spirits=byName(ui,'spirit').map(n=>{const ut=utOf(n),pic=n.children.find(c=>c.name==='pic'),put=pic?utOf(pic):null;
    return {ratio:ut&&put?Number((put.width/ut.width).toFixed(3)):-1,hasMask:!!n.getComponent('cc.Mask')};});
  return {
    status:info(status),icons:icons,nums:nums,
    resNumPlates:byName(ui,'resNumPlate').length,
    hpBg:info(hpBg),hpDeco:info(deco),hpFills:hpFills,
    tracks:tracks,unitFills:unitFills,plates:plates,spirits:spirits,
    waveBadge:byName(ui,'button_wave').length,nav:byName(ui,'btn').length,
    unitChips:byName(ui,'unitHpChip').length,
    masksActive:byName(ui,'unitDeadMask').filter(n=>n.active).length
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
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' &&
        !/favicon/.test(m.params.entry.text)) errors.push(String(m.params.entry.text));
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
  console.log('booted:', booted, ' save:', SAVE);
  if (!booted) throw new Error('页面未启动');
  await sleep(6000);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const samples = [];
  let shotDone = false, shotRatio = null;
  for (let k = 0; k < 14; k++) {
    const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const s = r.result && r.result.value;
    if (s && !s.error) samples.push(s);
    const cur = samples[samples.length - 1];
    if (cur && cur.hpFills && cur.hpFills.length) {
      const live = cur.hpFills.filter((f) => f.active).map((f) => f.w);
      const ratio = live.length ? Math.max(...live) / 586 : 0;
      if (!shotDone && ratio >= 0.40 && ratio <= 0.70) {
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
        shotDone = true; shotRatio = Number(ratio.toFixed(3));
      }
    }
    await sleep(1100);
  }
  if (!shotDone) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  }
  const last = samples[samples.length - 1];
  const decoKeys = samples.map((s) => s.hpDeco ? JSON.stringify(s.hpDeco) : 'NONE');
  const decoStable = decoKeys.every((k) => k === decoKeys[0]);
  const fillWs = samples.map((s) => s.hpFills.filter((f) => f.active).map((f) => f.w).join('/'));
  const geo = last.unitFills.map((f, i) => {
    const t = last.tracks[i];
    const slot = t && f ? Number(((t.h - f.h) / 2).toFixed(1)) : -1;
    const trackBottom = t ? Number((t.y - t.h / 2).toFixed(1)) : 0;
    const plate = last.plates[i];
    const plateTop = plate ? Number((plate.y + plate.h / 2).toFixed(1)) : 0;
    return { slot, trackBottom, plateTop, overlap: Number((plateTop - trackBottom).toFixed(1)) };
  });

  fs.writeFileSync(path.join(path.dirname(OUT), path.basename(OUT, '.png') + '_probe.json'),
    JSON.stringify({ samples, errors, decoStable, shotRatio, geo }, null, 2));

  console.log('==== R9 PROBE ====');
  console.log('resNumPlates=' + last.resNumPlates + ' 方章=' + last.icons.length +
    ' 数字Label=' + last.nums.length + ' nav=' + last.nav + ' badges=' + last.waveBadge);
  console.log('数字:', last.nums.map((n) => n.text + '/' + n.rgb + '/outline' + n.outline + '-' + n.ow +
    '/ovf' + n.overflow + '/ax' + n.anchorX + '/w' + n.w).join(' | '));
  console.log('名牌 y:', last.plates.map((p) => p.y).join(','), ' 高度:', last.plates.map((p) => p.h).join(','));
  console.log('槽厚(单侧设计px):', geo.map((g) => g.slot).join(','));
  console.log('track底/名牌顶/重叠:', geo.map((g) => g.trackBottom + '/' + g.plateTop + '/' + g.overlap).join(' | '));
  console.log('hpBg:', JSON.stringify(last.hpBg));
  console.log('hpDeco:', JSON.stringify(last.hpDeco));
  console.log('金饰恒定:', decoStable, ' fill宽采样:', fillWs.join(' | '));
  console.log('截图血量比:', shotRatio === null ? '未落入40-70%(满血档)' : shotRatio);
  console.log('unitFill(type/range):', last.unitFills.map((f) => f.type + '/' + f.fillRange).join(' | '));
  console.log('spirit 宽比:', last.spirits.map((s) => s.ratio).join(','),
    ' 带Mask:', last.spirits.filter((s) => s.hasMask).length);

  const bad = [];
  if (last.resNumPlates !== 0) bad.push('resNumPlate 未删净: ' + last.resNumPlates);
  if (last.icons.length !== 4) bad.push('方章数 != 4: ' + last.icons.length);
  if (last.nums.length !== 4) bad.push('数字 Label 数 != 4: ' + last.nums.length);
  if (last.nums.some((n) => !n.outline || n.ow !== 1)) bad.push('数字 1px 描边丢失');
  if (last.nums.some((n) => n.overflow !== 2)) bad.push('数字 SHRINK 丢失');
  if (last.nums.some((n) => n.anchorX !== 0)) bad.push('数字左对齐丢失');
  if (last.hpBg && last.hpBg.sf !== 'hp_total_bg') bad.push('hpBg 资源错');
  if (!last.hpDeco || last.hpDeco.sf !== 'hp_total_deco' || last.hpDeco.z !== 2) bad.push('hpDeco 错');
  if (!decoStable) bad.push('金饰随血量变化');
  if (last.unitFills.some((f) => f.type !== 3)) bad.push('单位 fill 非 FILLED');
  if (geo.some((g) => g.slot < 3.5 || g.slot > 6.5)) bad.push('槽厚不在 3.5-6.5 设计px');
  if (geo.some((g) => g.overlap > 0.6)) bad.push('名牌仍压住 track 下缘');
  if (last.spirits.some((s) => s.hasMask || s.ratio < 0.85)) bad.push('立绘占位回退');
  console.log('断言失败:', bad.length ? bad.join(' / ') : '无');
  console.log('JS 异常:', errors.length + (errors.length ? ' -> ' + errors.slice(0, 3).join(' | ') : ''));
  console.log('screenshot:', OUT);
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
