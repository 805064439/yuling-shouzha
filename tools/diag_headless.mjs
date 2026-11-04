// 无头 Chrome CDP 诊断：加载 URL，收集 console / 异常，并截图。
// 仅用 Node 22 内置 WebSocket + fetch，无需任何 npm 依赖。
const fs = await import('node:fs');

const PORT = 9222;
const targetUrl = process.argv[2] || 'https://election-depot-astronomy-joint.trycloudflare.com';

async function getTargets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json`);
  return await r.json();
}

async function main() {
  let list = await getTargets();
  let target = list.find((t) => t.type === 'page');
  if (!target) {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(targetUrl),
    });
    target = await r.json();
  }
  const wsUrl = target.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('no webSocketDebuggerUrl: ' + JSON.stringify(target));

  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ');
      logs.push(`[console.${m.params.type}] ${txt}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const ed = m.params.exceptionDetails;
      logs.push(`[EXCEPTION] ${ed.text}: ${ed.exception && ed.exception.description ? ed.exception.description : ''} @ ${ed.url}:${ed.lineNumber}`);
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      logs.push(`[log.${e.level}] ${e.text}`);
    }
  });

  await new Promise((res) => ws.addEventListener('open', () => res()));
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.enable');
  await send('Page.navigate', { url: targetUrl });

  // 等待加载 + 运行
  await new Promise((r) => setTimeout(r, 20000));
  try {
    const info = await send('Runtime.evaluate', {
      expression:
        "(()=>{const d=document.getElementById('__diag');return JSON.stringify({diag:d?d.textContent:'NO_DIAG',hasCanvas:!!document.getElementById('GameCanvas'),bodyChildren:document.body.children.length});})()",
      returnByValue: true,
    });
    logs.push('[page-info] ' + (info.result && info.result.value));
  } catch (e) {
    logs.push('[page-info failed] ' + e.message);
  }
  // 运行时场景图自查（与渲染无关，确认节点/层级/坐标是否真的建好）
  try {
    const sg = await send('Runtime.evaluate', {
      expression:
        "(()=>{try{const ui=window.__ui;if(!ui)return 'NO_UI';const out=['UI layer='+ui.layer+' active='+ui.active+' pos='+JSON.stringify(ui.position)+' size='+(ui.getComponent('cc.UITransform')?JSON.stringify(ui.getComponent('cc.UITransform').contentSize):'none')];for(const c of ui.children){const ut=c.getComponent('cc.UITransform');out.push('  '+c.name+' layer='+c.layer+' active='+c.active+' pos='+JSON.stringify(c.position)+' size='+(ut?JSON.stringify(ut.contentSize):'none')+' btn='+(c.getComponent('cc.Button')?'Y':'n'));}return out.join(' | ');}catch(e){return 'SGERR '+e.message;}})()",
      returnByValue: true,
    });
    logs.push('[scene-graph] ' + (sg.result && sg.result.value));
  } catch (e) {
    logs.push('[scene-graph failed] ' + e.message);
  }
  // 隐藏可能的 splash 遮罩，露出 canvas
  try {
    await send('Runtime.evaluate', {
      expression:
        "Array.from(document.body.children).forEach(c=>{ if(c.tagName!=='CANVAS' && c.id!=='__diag'){ c.style.display='none'; } }); true",
      returnByValue: true,
    });
  } catch (e) {
    logs.push('[hide splash failed] ' + e.message);
  }
  try {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(new URL('./diag_shot.png', import.meta.url), Buffer.from(shot.data, 'base64'));
    logs.push('[screenshot] saved diag_shot.png');
  } catch (e) {
    logs.push('[screenshot failed] ' + e.message);
  }

  console.log('==== COLLECTED LOGS ====');
  console.log(logs.join('\n') || '(no logs)');
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('DIAG ERROR:', e);
  process.exit(1);
});
