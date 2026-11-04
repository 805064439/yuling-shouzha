# 育灵手札（yuling-shouzha）

一款**灵怪放置养成**小游戏：召唤精怪、升星进化、编队自动战斗、离线也能收灵气。
基于 **Cocos Creator 3.8.8 + TypeScript**，可发布为 **web-mobile 网页** 与 **微信小游戏**。

> 「育灵手札」= 育灵（培养灵怪）+ 手札（修行笔记）。

## 玩法特性

- 🎴 **召唤精怪**：单抽 / 十连 / 抽光，SSR 软保底计数，10 种精怪（N/R/SR/SSR 四档稀有度）
- ⭐ **升星进化**：初生 → 觉醒 → 真灵三阶段，每阶段独立立绘，星数上限随进化提升
- 🛡 **编队出战**：最多 N 只上阵，点选编队，战力 = 基础值 × 升星 × 进化倍率
- ⚔ **自动战斗**：定时结算收益，离线补算（有封顶），战斗掉落灵核（进化材料）
- 🏪 **灵物商店**：每日免费券、召唤券、灵核礼包、直购精怪、看广告得灵气
- 💾 **自动存档**：Web 用 localStorage，微信小游戏自动切 wx storage，字段级兜底防旧档缺字段

## 技术要点

| 特性 | 说明 |
|---|---|
| 代码驱动 UI | 全部 UI 由 TS 工厂函数动态创建（`widgets.ts`），**零 prefab、零场景编辑** |
| 逻辑层解耦 | `logic/` 目录纯 TS、零引擎依赖，可独立跑算法自测（`node tools/verify_algo.mjs`，23 项校验） |
| 立绘动态加载 | `resources/spirits/` 30 张立绘（10 精怪 × 3 形态），运行时按 `spirits/<id>/texture` 加载 Texture2D 再包装 SpriteFrame，contain 等比适配 |
| 三层缓存击穿 | 构建 `md5Cache` 文件哈希 + index.html 版本号补丁 + 服务器 `no-store` 头，更新后用户刷新即最新 |

## 目录结构

```
yuling-shouzha/
├── assets/
│   ├── scripts/
│   │   ├── Game.ts              # 入口引导：等 Canvas 就绪后启动 GameManager
│   │   ├── logic/               # 纯 TS 业务层（零引擎依赖，可单独测试）
│   │   │   ├── GameConfig.ts    # 全局配置 / 进化 / 升星 / 稀有度配色
│   │   │   ├── Spirits.ts       # 精怪图鉴数据 + 数值公式 + 立绘路径
│   │   │   ├── Save.ts          # 存档结构 + localStorage/wx 自适应封装
│   │   │   ├── Idle.ts          # 存档读写 + 离线结算
│   │   │   ├── Battle.ts        # 自动战斗数值演算
│   │   │   └── Gacha.ts         # 抽卡 / 升星 / 进化 / 商店（纯数据变更）
│   │   └── ui/
│   │       ├── GameManager.ts   # 页面路由 / 存档 / Toast 总控
│   │       ├── widgets.ts       # UI 原子组件工厂（Label/Button/Panel/Sprite/布局）
│   │       └── pages/           # Home / Team / Gacha / Shop / Dex / Detail / Battle
│   └── resources/spirits/       # 30 张立绘（10 精怪 × 初生/觉醒/真灵）
├── settings/                    # 工程设置（设计分辨率 750×1334 竖屏）
├── tools/
│   ├── verify_algo.mjs          # 逻辑层算法自测（23 项：保底/十连/离线封顶/倍率/进化条件）
│   ├── verify_sprites.mjs       # 立绘加载端到端验证（无头 Chrome + CDP）
│   ├── verify_shop.mjs          # 商店页端到端验证
│   ├── patch_build.js           # 构建后注入游戏入口引导
│   ├── patch_cache.js           # 构建后缓存补丁（?v=版本号 + no-store meta + 标题）
│   ├── serve_no_store.py        # 本地静态服务器（全响应 no-store 头）
│   └── gen_scene.py             # 场景文件生成脚本
├── tsconfig.json
├── package.json                 # Cocos 工程标记（Dashboard 可识别）
└── LICENSE                      # MIT
```

## 快速开始

### 1. 编辑器内运行

1. 安装 [Cocos Dashboard](https://www.cocos.com/creator-download) → 安装 **Creator 3.8.x LTS**；
2. 用 Dashboard 打开本目录（首次打开自动生成 `library/` 缓存）；
3. 顶部 ▶ 预览即可游玩。

### 2. 命令行构建 web-mobile

```bash
# 构建（md5Cache 让产物文件名带哈希，天然防缓存）
CocosCreator.exe --project <本目录> --build "platform=web-mobile;debug=false;md5Cache=true"

# 构建后补丁：注入游戏入口 + 缓存版本号
node tools/patch_build.js
node tools/patch_cache.js

# 本地起服务体验（8088 端口，响应带 no-store 头）
python tools/serve_no_store.py 8088
# 浏览器打开 http://127.0.0.1:8088/
```

### 3. 逻辑层自测（不需要编辑器）

```bash
node tools/verify_algo.mjs   # 23 项校验全部通过
```

## 设计分辨率与适配

750 × 1334 竖屏（FIT_WIDTH）。所有页面按此坐标体系布局，异形屏可给 UI 容器加 `Widget` 拉伸。

## License

[MIT](LICENSE) © 2026 Zhong
