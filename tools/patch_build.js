#!/usr/bin/env node
// 构建后补丁：在 web-mobile/index.js 的 application.start() 之后，
// 自动 import 入口引导模块（assets/scripts/Game.ts 编译后为 chunks:///_virtual/Game.ts）
// 并调用其 run()，从而在运行时启动游戏 UI。
// 原因：Cocos 构建期无法正确收集场景里引用的 ccclass 组件（ccclass is not a function），
// 直接挂组件会被剥离导致白屏；改为运行时引导 + 此补丁即可稳定体验。
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build', 'web-mobile');
if (!fs.existsSync(buildDir)) {
  console.error('未找到构建目录:', buildDir);
  process.exit(1);
}

// md5Cache 开启后入口文件带哈希（如 index.8d18b.js），优先从 index.html 解析，找不到再回退 index.js
let idxPath = path.join(buildDir, 'index.js');
const htmlPath = path.join(buildDir, 'index.html');
if (fs.existsSync(htmlPath)) {
  const m = fs.readFileSync(htmlPath, 'utf8').match(/System\.import\('\.\/(index\.[a-z0-9]+\.js)'\)/);
  if (m) idxPath = path.join(buildDir, m[1]);
} else if (fs.existsSync(idxPath)) {
  // 老结构，保持不变
} else {
  const cand = fs.readdirSync(buildDir).filter((f) => /^index\.[a-z0-9]+\.js$/.test(f));
  if (cand.length) idxPath = path.join(buildDir, cand[0]);
}

if (!fs.existsSync(idxPath)) {
  console.error('未找到构建产物入口 index*.js:', idxPath);
  process.exit(1);
}
console.log('入口文件:', path.relative(buildDir, idxPath));

let s = fs.readFileSync(idxPath, 'utf8');

const marker = "System.import('chunks:///_virtual/Game.ts')";
if (s.includes(marker)) {
  console.log('index.js 已打过补丁，跳过。');
  process.exit(0);
}

const oldBlock = "      }).then(function () {\n        return application.start();\n      })[\"catch\"](function (err) {";
const newBlock = "      }).then(function () {\n        return application.start();\n      }).then(function () {\n        return System.import('chunks:///_virtual/Game.ts').then(function (m) {\n          if (m && m.run) { m.run(); }\n        });\n      })[\"catch\"](function (err) {";

if (!s.includes(oldBlock)) {
  console.error('未在 index.js 中找到可替换的锚点，请检查构建产物结构。');
  process.exit(1);
}

s = s.replace(oldBlock, newBlock);
fs.writeFileSync(idxPath, s);
console.log('已为 index.js 注入入口引导补丁。');
