#!/usr/bin/env node
// 构建后缓存补丁：给 index.html 里所有静态资源引用追加 ?v=<时间戳>，
// 并注入 no-store meta。每次部署重跑即可刷新版本号（幂等：先清掉旧 ?v= 再加新的）。
// 配合 md5Cache（chunk 文件名带哈希）+ 本地服务器 no-store 头，三层击穿缓存。
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'build', 'web-mobile', 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('未找到构建产物 index.html:', htmlPath);
  process.exit(1);
}

const stamp = new Date();
const pad = (n) => String(n).padStart(2, '0');
const v = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}${pad(stamp.getHours())}${pad(stamp.getMinutes())}`;

let html = fs.readFileSync(htmlPath, 'utf8');

// 先移除旧版本号（幂等）
html = html.replace(/\?v=\d+/g, '');

// 给本地静态资源引用加版本号（style.css / src/*.js / src/*.json）
html = html.replace(/href="([^":]+\.css)"/g, `href="$1?v=${v}"`);
html = html.replace(/src="([^":]+\.(?:js|json))"/g, `src="$1?v=${v}"`);
html = html.replace(/System\.import\('\.\/index\.js'\)/g, `System.import('./index.js?v=${v}')`);

// 注入 no-store meta（已有则跳过）
if (!html.includes('http-equiv="Cache-Control"')) {
  html = html.replace(
    '<meta charset="utf-8">',
    `<meta charset="utf-8">\n  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">\n  <meta http-equiv="Expires" content="0">`,
  );
}

// 页面标题正式化（构建产物默认是 "Cocos Creator | <工程名>"）
html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>育灵手札</title>');

fs.writeFileSync(htmlPath, html);
console.log(`index.html 已加版本号 v=${v} 并注入 no-store meta。`);
