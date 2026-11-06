# 育灵手札 · 主页 UI 重设计与切图接入说明

> 交付日期：2026-11-06 ｜ 目标版本：仓库 `main` 分支（Cocos Creator 3.8.8 + TypeScript，零 prefab / 代码驱动 UI）
> 本包内容：`ui/` 下 **27 张主页切图** + 本说明文档 + `contact_sheet.png`（接触表）
> 设计基准：《育灵手札-美术UI风格提案.md》v2.0 方向 B「暮色灵墨」，色板与 `widgets.ts` 的 `COLORS` 完全一致

---

## 0. 先读：这次改的是什么

**结论：不改玩法、不改逻辑层、不动已接入的 3 张面板，只替换主页（battle 页）的视觉层。**

程序那边已经把上一轮交付的 `widgets.ts` 与 `ui_panel_ink / paper / deep` 接进去了（`loadUiFrame` / `preloadUiPanels` 已存在），本次是**增量补切图**：把主页里残留的紫红硬编码、emoji 按钮、纯文字状态行，换成暮色灵墨的完整切图体系。

⚠️ **你发的截图是「编队出战」页（team）**，但 `GameManager.start()` 里 `this.go('battle')`，启动进的是**挂机战斗页**，那才是主页。本方案按 battle 主页设计；底部导航、纸舞台、面板等是共用组件，编队页同样受益（第 6 节给了编队页的顺手改法）。

### 现状六个问题（对照截图与 `Battle.ts`）

| # | 问题 | 为什么是问题 | 改成什么样 |
|---|---|---|---|
| 1 | 顶部状态是一整行 22px 文字，塞 5 项数据 | 无分组、无图标、无层级，放置游戏最需要盯的资源数字反而最难读 | `ui_panel_status` 墨面状态条 + 4 组「图标 + 金色数字」 |
| 2 | 敌方总血条 `#3a2030` 底 + `#e05a6f` 填充 | 紫红/亮红不在色板里，和墨青夜底是两套东西 | 墨面底槽 `ui_bar_hp_bg` + 白色填充染暖红三态 |
| 3 | 单位血条 `#2a2028`、数字胶囊 `#1b1622`、遮罩 `#241b26` | 紫黑系，同上 | `ui_bar_unit_bg/fill` + `ui_chip_hp` + `ui_mask_dead` |
| 4 | 底部 5 个按钮带 emoji（`🛡🎴📖🏪🌸`） | emoji 是开发期兜底，正式版禁用；且各机型字形不一致 | `ui_nav_bar` + 5 枚描线图标 + 无 emoji 文字 |
| 5 | 我方血条 `#6fd6a0` 荧光绿、我方/敌方标签 `#e8b0bc` 粉字 | 与色板绿 `#5FAE57`/金 `#E0A93F` 不同族 | 统一到 `COLORS.green` / `COLORS.gold` |
| 6 | 敌方舞台底衬 `tierStageColor` 紫灰系 | 和夜底混在一起，立绘不「贴」纸 | 换暮色冷色系，纸面板承托不变 |

---

## 1. 新主页布局（750×1334，FIT_WIDTH，坐标以屏幕中心为原点）

**分层原则：墨面做环境，纸面做内容载体；金色只出现在 CTA / 波次 / 稀有语义。**

```
 y=+667 ┌─────────────────────────────────────┐
        │ ① 状态条  ui_panel_status  710×72   │  y=+625
        │    [主角Lv] [🌿灵气][💎灵核][🎫券][🌙波] │  图标+金色数字
        │ ② 进度行  击杀 x/y · 最高波 · 挑战次数  │  y=+572  (COLORS.sub, 17px)
        │ ③ 波次徽章 ui_badge_wave 200×56       │  y=+540  x=+230（血条上方，右偏）
        │ ④ 敌方总血条 ui_bar_hp_bg 620×40      │  y=+480  fill 染色三态
        ├──── ui_divider_gold 金线 620×4 ───────┤  y=+448
        │    敌方编队 标题                        │  y=+432
        │ ⑤ 敌方区  3× ui_panel_paper 纸舞台     │  y=+330  170×175
        │    每只：立绘 + ui_bar_unit_* + chip    │
        │    「我方」标签                         │  y=+215
        │    我方两行舞台 (主角 + 精灵)           │  y=+105 / -105
        ├───────────────────────────────────────┤
        │ ⑥ 战斗日志 ui_panel_ink 660×175       │  y=-305
        │    顶部压一条 ui_divider_gold          │
        │ ⑦ 导航条  ui_nav_bar 750×140          │  y=-560
        │    5× ui_btn_nav_off/on + 图标 + 文字  │
 y=-667 └─────────────────────────────────────┘
```

**坐标对照表**（直接改 `Battle.ts` 里对应的 `setPosition`；已按「区块不重叠」逐层核算）：

| 元素 | 原 y | 新 y | 尺寸 | 上下留白 | 切图 |
|---|---|---|---|---|---|
| 顶部状态 | 628 / 600 | **625** / 572 | 710×72 / 660×22 | 状态条底 589 → 进度顶 583，gap 6 | `ui_panel_status` |
| 波次徽章 | 无 | **540**（x=+230） | 200×56 | 徽章底 512 → 血条顶 500，gap 12 | `ui_badge_wave` |
| 敌方总血条 | 566 | **480** | 620×40 | 血条底 460 → 金线 448，gap 8 | `ui_bar_hp_bg` + `ui_bar_hp_fill` |
| 金线 | 无 | **448** | 620×4 | — | `ui_divider_gold` |
| 敌方标题 | 无 | **432** | — | 金线 448 → 标题 432，gap 12 | — |
| 敌方行 | 455 | **330** | 170×175 ×3 | 卡片顶 417.5 → 标题 432，gap 14.5 | `ui_panel_paper`（已有） |
| 我方标签 | 345 | **215** | — | 敌方卡片底 242.5 → 标签 215，gap 27.5 | — |
| 我方两行 | 235 / 5 | **105 / -105** | 180×205 | 行1 底 2.5 → 行2 顶 -2.5，gap 5（见注） | `ui_panel_paper`（已有） |
| 战斗日志 | -235 | **-305** | 660×175 | 行2 底 -207.5 → 日志顶 -217.5，gap 10 | `ui_panel_ink`（已有） |
| 底部导航 | -430（5 按钮） | **-560**（导航条） | 750×140 | 日志底 -392.5 → 导航顶 -490，gap 97.5 | `ui_nav_bar` + `ui_btn_nav_*` |

> 注：我方两行用 `ALLY_SLOT.h=205` 时两行间距仅 5px，偏挤。**若实际编队满 5 人走两行布局，把 `ALLY_SLOT.h` 从 205 调到 190**（同时 `pic/picH` 各减 10），两行 gap 就能到 20px。`singleRow`（≤3 人）不受影响。

> 若不想动布局坐标，第 5 节给的是**颜色/组件替换版**关键代码，可只换皮不改坐标；完整重排按上表调整。

---

## 2. 色号替换表（把硬编码改成色板语义色）

| 原值（`Battle.ts` / `GameManager.ts`） | 用途 | 新值 / 切图 |
|---|---|---|
| `#3a2030` | 敌方总血条底 | `ui_bar_hp_bg` |
| `#e05a6f` | 普通波敌血填充 | `#C96A5A`（染 `ui_bar_hp_fill`） |
| `#d97a3c` | 精英波 | `#C9823F` |
| `#c8324b` | 教主波 | `#A8453F` |
| `#2a2028` | 单位血条底 | `ui_bar_unit_bg` |
| `#1b1622` | 血量数字胶囊 | `ui_chip_hp` |
| `#241b26` | 倒下遮罩 | `ui_mask_dead` |
| `#6fd6a0` | 我方血条 | `#5FAE57`（`COLORS.green`） |
| `#4b4550` | 死亡灰 | `#5A6660` |
| `#ffd9e2` / `#ffffff` | 遮罩字 / 数字 | `#EDE6D4`（`COLORS.text`） |
| `#e8b0bc` | 精英标签粉字 | `#E0A93F`（`COLORS.gold`） |
| `#5a5468/#6e4a68/#7a3e50/#8a3050` | 敌方舞台底衬 | `#4A5D63 / #5C5068 / #6E4A55 / #7A4050` |
| `#101324`（`GameManager.toast`） | Toast 底 | `COLORS.panel` |

**保留不动**：`RARITY_COLOR` 四色、`GAME_CONFIG` 全部数值、立绘路径、战斗逻辑。

---

## 3. 切图逐张规格（27 张，全部 1x，透明底 PNG）

> 与项目现有 `ui_panel_ink.png (120×120)` 同一体系：**1x，文件名不带 `@2x`**。
> `insetBorder` = 九宫格四边内缩像素；`—` 表示普通 Sprite（Type=SIMPLE），不做九宫格。

### 3.1 结构件（18 张，程序绘制，色号精确）

| 文件名 | 尺寸 | border | 用途 |
|---|---|---|---|
| `ui_panel_status.png` | 120×72 | 22 | 顶部状态条，墨面 + 低对比暗纹 |
| `ui_bar_hp_bg.png` | 80×40 | 16 | 敌方总血条底槽 |
| `ui_bar_hp_fill.png` | 80×40 | 16 | **纯白**填充，运行时 `Sprite.color` 染三态 |
| `ui_bar_unit_bg.png` | 48×14 | 7 | 单位血条底槽 |
| `ui_bar_unit_fill.png` | 48×14 | 7 | **纯白**填充，染我方绿/敌方暖红 |
| `ui_chip_hp.png` | 48×26 | 12 | 血量数字胶囊 |
| `ui_mask_dead.png` | 64×44 | 14 | 倒下遮罩（暖红细描边） |
| `ui_nav_bar.png` | 120×80 | 24 | 底部导航条，墨面 |
| `ui_btn_nav_off.png` | 96×64 | 22 | 导航按钮默认态 |
| `ui_btn_nav_on.png` | 96×64 | 22 | 导航按钮激活态（金描边） |
| `ui_badge_wave.png` | 96×56 | 18 | 波次徽章（金边墨面） |
| `ui_btn_primary.png` | 96×70 | 24 | 主按钮（灵气金） |
| `ui_btn_primary_pressed.png` | 96×70 | 24 | 主按钮按压态 |
| `ui_btn_plain.png` | 96×70 | 24 | 次级按钮（墨面） |
| `ui_btn_plain_pressed.png` | 96×70 | 24 | 次级按钮按压态 |
| `ui_btn_green.png` | 96×70 | 24 | 确认按钮（绿） |
| `ui_btn_green_pressed.png` | 96×70 | 24 | 确认按钮按压态 |
| `ui_divider_gold.png` | 620×4 | — | 金色分隔线（横向拉伸，普通 Sprite） |

### 3.2 图标（9 张，AI 生成 → 抠底 → 64×64）

| 文件名 | 尺寸 | border | 用途 |
|---|---|---|---|
| `ui_icon_aura.png` | 64×64 | — | 灵气（金色灵气丝带） |
| `ui_icon_core.png` | 64×64 | — | 灵核（青蓝晶核） |
| `ui_icon_ticket.png` | 64×64 | — | 召唤券（纸符） |
| `ui_icon_wave.png` | 64×64 | — | 波数 / 最高波（金月牙） |
| `ui_nav_team.png` | 64×64 | — | 编队 |
| `ui_nav_gacha.png` | 64×64 | — | 召唤 |
| `ui_nav_dex.png` | 64×64 | — | 图鉴 |
| `ui_nav_shop.png` | 64×64 | — | 商店 |
| `ui_nav_hero.png` | 64×64 | — | 主角 |

> 图标统一画法：细深绿棕描线 `#3E3A30` + 平涂水彩 + 小高光，与初生立绘同族。
> **已处理**：AI 把品红画进物体内部的残留（商店遮篷、灵核轨道弧）已按色板重上色，27 张全部通过「品红残留 = 0」校验；AI 水印已清除。

### 3.3 依赖已有切图（本包**不含**，勿删）

`assets/resources/ui/` 下已有的 `ui_panel_ink.png (120×120, border16)`、`ui_panel_paper.png (120×120, border16)`、`ui_panel_deep.png (96×96, border14)` —— 主页的纸舞台、日志面板、内嵌区继续用它们，本包不重复提供。

### 3.4 预算

| 项 | 数值 | 口径 |
|---|---|---|
| PNG 总体积 | **65.7 KB** | 27 张实测 |
| 未压缩显存 | **0.49 MB** | Σ(W×H×4)，RGBA8888 |
| 打图集后 | ≤1.0 MB | 512×512 RGBA8888 |
| 包体增量 | <100 KB | 微信小游戏主包 4MB 红线内 |
| draw call | 主页约 30 个 UI 节点 → 单图集合批后 3–5 | Label 会打断合批，属正常 |

---

## 4. 配置流程（按顺序做，约 15 分钟）

### Step 1 · 放文件
把 `ui/` 下 27 张 PNG 拷到 `assets/resources/ui/`，与现有 3 张面板同目录。
⚠️ **不要拷 `.meta`**：Cocos 会自动生成新 uuid，手工复制已有 meta 会造成 uuid 冲突。

### Step 2 · 让编辑器导入
用 Cocos Dashboard 打开工程（3.8.x），等资源导入完成。检查任一新图的 `.meta` 应为：

```json
"userData": { "type": "texture", "hasAlpha": true, "fixAlphaTransparencyArtifacts": false }
```

`subMetas` 里应有 `name: "texture"` 的子资源（`wrapModeS/T: repeat`、`minfilter/magfilter: linear`、`mipfilter: none`）。
与现有 `ui_panel_ink.png.meta` 一致即可。**若 `type` 不是 `texture`，`resources.load('ui/<name>/texture', Texture2D)` 会返回 null。**

### Step 3 · 追加通用加载器
在 `assets/scripts/ui/widgets.ts` 末尾追加第 5.1 节代码（不改动现有 `loadUiFrame` / `preloadUiPanels`）。

### Step 4 · 预载
`GameManager.start()` 里 `preloadUiPanels()` 后面加一行 `preloadHomeUi();`（第 5.2 节）。

### Step 5 · 替换主页视觉层
按第 5.3–5.7 节替换 `Battle.ts` 的 5 段；`GameManager.toast()` 的底色按第 2 节表改。

### Step 6 · 验证
```bash
node tools/verify_algo.mjs          # 逻辑层 23 项自测，应全过
```
编辑器内预览 → 按第 7 节验收清单逐项目检；再构建 web-mobile 与微信小游戏各跑一次。

### 常见坑（项目已踩过）
1. **路径必须是 `ui/<name>/texture`**：本项目 PNG 按 `texture` 导入，主资源不是 `SpriteFrame`。写成 `resources.load('ui/xxx', SpriteFrame)` 会静默返回 null。
2. **九宫格必须 `sp.type = 1 (SLICED)` + `sizeMode = 0 (CUSTOM)` + `trim = false`**，否则按原图尺寸渲染或裁掉圆角。
3. **白色填充图靠 `Sprite.color` 染色**，不要换 spriteFrame；染色的前提是切图本身纯白（本包已保证）。
4. **`ui_divider_gold` 不要设 border**（620×4 太扁，九宫格会崩），用普通 Sprite 横向拉伸。
5. **禁止对新切图做 trim**：九宫格边框等宽依赖原始留白。
6. **已接入的 3 张面板别用新加载器**：`ui_panel_ink/paper/deep` 只能走现有 `makePanel` / `loadUiFrame`（它们有 border 16/14 且已缓存）；`makeUiSprite` 的 `UI_BORDER` 不含这三个名字，误用会退化成 SIMPLE 拉伸。

---

## 5. 关键代码（可直接粘贴，Cocos Creator 3.8 / TypeScript）

### 5.1 `widgets.ts` 追加：通用 UI 切图加载器

```ts
// ===== 主页切图加载（1x，texture 导入，运行时包 SpriteFrame）=====
// 九宫格 border 表：键 = 文件名（不含扩展名），值 = 四边内缩 px
export const UI_BORDER: Record<string, number> = {
  ui_panel_status: 22,
  ui_bar_hp_bg: 16, ui_bar_hp_fill: 16,
  ui_bar_unit_bg: 7, ui_bar_unit_fill: 7,
  ui_chip_hp: 12, ui_mask_dead: 14,
  ui_nav_bar: 24, ui_btn_nav_off: 22, ui_btn_nav_on: 22,
  ui_badge_wave: 18,
  ui_btn_primary: 24, ui_btn_primary_pressed: 24,
  ui_btn_plain: 24, ui_btn_plain_pressed: 24,
  ui_btn_green: 24, ui_btn_green_pressed: 24,
  // ui_divider_gold / 9 枚图标：无 border，普通 Sprite
};

const homeSfCache: Record<string, SpriteFrame> = {};

export function loadHomeFrame(name: string): Promise<SpriteFrame | null> {
  if (homeSfCache[name]) return Promise.resolve(homeSfCache[name]);
  return new Promise((resolve) => {
    // 与现有 loadUiFrame 同一坑位写法：必须取 /texture 子资源
    resources.load(`ui/${name}/texture`, Texture2D, (err: any, tex: Texture2D) => {
      if (err || !tex) { resolve(null); return; }
      const sf = new SpriteFrame();
      sf.name = name;
      sf.texture = tex;
      sf.rect = new Rect(0, 0, tex.width, tex.height);
      sf.originalSize = new Size(tex.width, tex.height);
      const b = UI_BORDER[name];
      if (b) sf.insetBorder = new Rect(b, b, b, b);   // SLICED 依赖它
      homeSfCache[name] = sf;
      resolve(sf);
    });
  });
}

export const HOME_UI_NAMES = [
  ...Object.keys(UI_BORDER),
  'ui_divider_gold',
  'ui_icon_aura', 'ui_icon_core', 'ui_icon_ticket', 'ui_icon_wave',
  'ui_nav_team', 'ui_nav_gacha', 'ui_nav_dex', 'ui_nav_shop', 'ui_nav_hero',
];

export function preloadHomeUi(): void {
  HOME_UI_NAMES.forEach(loadHomeFrame);
}

/** 创建一张切图节点：有 border 走 SLICED，无 border 走 SIMPLE；未预载完先用色板兜底 */
export function makeUiSprite(
  parent: Node, name: string, w: number, h: number,
  fallbackHex = COLORS.panel,
): Node {
  const n = newNode(name, parent);
  setSize(n, w, h);
  const apply = (sf: SpriteFrame): void => {
    const g = n.getComponent(Graphics);
    if (g) g.destroy();
    n['_bg'] = undefined;
    n['_grad'] = undefined;
    let sp = n.getComponent(Sprite);
    if (!sp) sp = n.addComponent(Sprite);
    sp.type = UI_BORDER[name] ? 1 : 0;   // 1 = SLICED, 0 = SIMPLE
    sp.sizeMode = 0;                      // CUSTOM：按 contentSize 拉伸
    sp.trim = false;
    sp.spriteFrame = sf;
  };
  const cached = homeSfCache[name];
  if (cached) apply(cached);
  else {
    setBg(n, fallbackHex);               // 首帧兜底，避免闪白
    loadHomeFrame(name).then((sf) => { if (sf && n.isValid) apply(sf); });
  }
  return n;
}

/** 白色填充图染色（乘算）：血条三态、我方/敌方血条共用 */
export function tintUiSprite(n: Node, hex: string): void {
  const sp = n.getComponent(Sprite);
  if (sp) sp.color = hexToColor(hex);
}
```

### 5.2 `GameManager.ts` 一行改动

```ts
import { preloadHomeUi } from './widgets';   // 追加到现有 import

start(): void {
  preloadUiPanels();   // 已有
  preloadHomeUi();     // ★ 新增：预载主页 27 张切图
  recalcIdleMult(this.state);
  ...
}
```

并把 `toast()` 里的底色换掉：
```ts
const panel = makePanel(this.root, { w: 560, h: 90, bg: COLORS.panel });  // 原 '#101324'
```

### 5.3 `Battle.ts` · 顶部状态条（替换原 info / progressLbl 段）

```ts
import {
  makeLabel, makeButton, makePanel, makeSpirit, makeSpiritStage, setSize, setBg,
  makeUiSprite, tintUiSprite, COLORS,
} from '../widgets';

// ① 状态条
const status = makeUiSprite(root, 'ui_panel_status', 710, 72, COLORS.panel);
status.setPosition(0, 625, 0);

const RES: Array<[string, () => string, string]> = [
  ['ui_icon_aura',   () => `${Math.floor(s.gold)}`,              '灵气'],
  ['ui_icon_core',   () => `${s.cores || 0}`,                    '灵核'],
  ['ui_icon_ticket', () => `${s.tickets}`,                       '券'],
  ['ui_icon_wave',   () => `${Math.max(1, s.bestWave || 1)}`,    '最高波'],
];
const resLabels: any[] = [];
makeLabel(status, `主角 Lv.${s.level}`, { fontSize: 22, color: COLORS.text })
  .setPosition(-270, 0, 1);
RES.forEach(([icon, get, label], i) => {
  const x = -140 + i * 135;
  makeUiSprite(status, icon, 36, 36, COLORS.gold).setPosition(x - 34, 0, 1);
  const num = makeLabel(status, get(), { fontSize: 24, color: COLORS.gold });
  num.setPosition(x + 6, 0, 1);
  resLabels.push(num);
  makeLabel(status, label, { fontSize: 15, color: COLORS.sub }).setPosition(x + 6, -20, 1);
});
const refreshInfo = (): void => {
  RES.forEach(([, get], i) => {
    const n = resLabels[i];
    if (n && n.isValid) (n.getComponent('cc.Label') as any).string = get();
  });
};

// ② 进度行
const progressLbl = makeLabel(root, '', { fontSize: 17, color: COLORS.sub });
setSize(progressLbl, 660, 22);
progressLbl.setPosition(0, 572, 0);
```

### 5.4 `Battle.ts` · 波次徽章 + 总血条（替换原 hpBg 段）

```ts
// ③ 波次徽章
const badge = makeUiSprite(root, 'ui_badge_wave', 200, 56, COLORS.bg);
badge.setPosition(230, 540, 0);   // 血条上方右偏，绝不与血条同 y 带
const waveLbl = makeLabel(badge, `第 ${startWave} 波`, { fontSize: 22, color: COLORS.gold });
waveLbl.setPosition(0, 0, 1);

// ④ 总血条：底槽 + 白色填充（染三态）
const hpBg = makeUiSprite(root, 'ui_bar_hp_bg', 620, 40, '#141C1E');
hpBg.setPosition(0, 480, 0);
const hpFill = makeUiSprite(hpBg, 'ui_bar_hp_fill', 620, 40, '#FFFFFF');
hpFill.setPosition(0, 0, 1);
const hpLbl = makeLabel(hpBg, `敌方 · ${stageLabel(startWave)}`, {
  fontSize: 20, color: COLORS.text,
});
setSize(hpLbl, 620, 26);
hpLbl.setPosition(0, 0, 2);

const HP_COLOR = (wave: number): string =>
  isBossWave(wave) ? '#A8453F' : isEliteWave(wave) ? '#C9823F' : '#C96A5A';

// 金线分隔
makeUiSprite(root, 'ui_divider_gold', 620, 4, COLORS.gold).setPosition(0, 448, 0);

// onTick 里的血条刷新（替换原 setSize + setBg 两行）
const w = Math.max(1, Math.min(1, ev.ratio)) * 620;
setSize(hpFill, w, 40);
hpFill.setPosition((w - 620) / 2, 0, 1);
tintUiSprite(hpFill, HP_COLOR(curWave));           // ★ 染色替代 setBg
(waveLbl.getComponent('cc.Label') as any).string = `第 ${curWave} 波`;
(hpLbl.getComponent('cc.Label') as any).string = `敌方 · ${stageLabel(curWave)}`;
```

> 初始也调一次：`tintUiSprite(hpFill, HP_COLOR(startWave));`

### 5.5 `Battle.ts` · 单位血条（整体替换 `makeUnitBar` 函数）

```ts
function makeUnitBar(
  stage: Node, slotW: number, slotH: number, color: string, deadText: string,
): UnitBar {
  const barW = slotW - 24;
  const barH = 14;
  const barY = -slotH / 2 + 16;

  const bg = makeUiSprite(stage, 'ui_bar_unit_bg', barW, barH, '#141C1E');
  bg.name = 'unitHpBar';
  bg.setPosition(0, barY, 2);
  const fill = makeUiSprite(bg, 'ui_bar_unit_fill', barW, barH, '#FFFFFF');
  fill.name = 'unitHpFill';
  fill.setPosition(0, 0, 1);
  tintUiSprite(fill, color);

  const chip = makeUiSprite(stage, 'ui_chip_hp', 92, 26, COLORS.bg);
  chip.name = 'unitHpChip';
  chip.setPosition(0, barY + 24, 3);
  const num = makeLabel(chip, '', { fontSize: 14, color: COLORS.text });
  num.name = 'unitHpNum';
  setSize(num, 92, 20);
  num.setPosition(0, 0, 1);

  const mask = makeUiSprite(stage, 'ui_mask_dead', slotW - 20, 44, '#141C1E');
  mask.name = 'unitDeadMask';
  mask.setPosition(0, 0, 4);
  makeLabel(mask, deadText, { fontSize: 18, color: COLORS.text });
  mask.active = false;

  return {
    update(u: Unit) {
      const ratio = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0;
      const w = Math.max(1, ratio * barW);
      setSize(fill, w, barH);
      fill.setPosition((w - barW) / 2, 0, 1);
      tintUiSprite(fill, u.dead ? '#5A6660' : color);
      (num.getComponent('cc.Label') as any).string =
        u.dead ? deadText : `${Math.max(0, Math.floor(u.hp))}/${u.maxHp}`;
      mask.active = u.dead;
    },
  };
}
```

调用处颜色改成色板值：
```ts
enemyBars.push(makeUnitBar(stage, ENEMY_SLOT.w, ENEMY_SLOT.h, '#C96A5A', '已击败'));
allyBars.push(makeUnitBar(heroStage, SLOT.w, SLOT.h, '#5FAE57', '倒下'));
```

### 5.6 `Battle.ts` · 战斗日志（替换 logPanel 段）

```ts
// 面板沿用现有 makePanel —— 它已经把 COLORS.panel 映射到 ui_panel_ink 九宫格切图；
// 不要用 makeUiSprite 加载 ui_panel_ink（UI_BORDER 未登记该名，会走 SIMPLE 而失真）
const logPanel = makePanel(root, { w: 660, h: 175, bg: COLORS.panel });
logPanel.setPosition(0, -305, 0);
makeUiSprite(logPanel, 'ui_divider_gold', 620, 4, COLORS.gold).setPosition(0, 78, 1);
const logLabel = makeLabel(logPanel, `${stageLabel(startWave)} · 挂机战斗中…`, {
  fontSize: 20, color: COLORS.sub, wrapWidth: 620,
});
logLabel.setPosition(0, 0, 1);
```

### 5.7 `Battle.ts` · 底部导航（替换原 nav 段，去 emoji）

```ts
const navBar = makeUiSprite(root, 'ui_nav_bar', 750, 140, COLORS.panel);
navBar.setPosition(0, -560, 0);

const NAV: Array<[string, string, string]> = [
  ['ui_nav_team',  '编队',  'team'],
  ['ui_nav_gacha', '召唤',  'gacha'],
  ['ui_nav_dex',   '图鉴',  'dex'],
  ['ui_nav_shop',  '商店',  'shop'],
  ['ui_nav_hero',  '主角',  'protagonist'],
];
NAV.forEach(([icon, label, key], i) => {
  const x = -296 + i * 148;
  const active = gm.current === key;
  const btn = makeUiSprite(navBar, active ? 'ui_btn_nav_on' : 'ui_btn_nav_off',
                           132, 88, COLORS.panel);
  btn.setPosition(x, 8, 1);
  makeUiSprite(btn, icon, 44, 44, active ? COLORS.gold : COLORS.text)
    .setPosition(0, 12, 2);
  makeLabel(btn, label, {
    fontSize: 18, color: active ? COLORS.gold : COLORS.text,
  }).setPosition(0, -26, 2);
  attachClick(btn, () => gm.go(key));   // 已有函数，从 widgets 引入
});
```

> `attachClick` 在 `widgets.ts` 已导出，需在 `Battle.ts` 的 import 里补上。

### 5.8 `Battle.ts` · 布局常量补丁（配合第 1 节坐标表）

`Battle.ts` 顶部三个常量 + 两处 `setPosition` 一起改，否则上面的新坐标不生效：

```ts
const ENEMY_SLOT = { w: 170, h: 175, pic: 148, picH: 158 };   // 原 w:160
const ALLY_SLOT  = { w: 180, h: 190, pic: 165, picH: 172 };   // 原 h:205 / picH:182
const ALLY_ROW_Y = [105, -105];                                 // 原 [235, 5]

// 敌方行容器
enemyRow.setPosition(0, 330, 0);                                // 原 455
// 我方标签
makeLabel(root, '我方', { fontSize: 20, color: COLORS.sub })
  .setPosition(-320, 215, 0);                                   // 原 (-320, 345)
// 敌方区标题（新增，放在金线下方）
makeLabel(root, '敌方编队 · 蚀灵教', { fontSize: 19, color: COLORS.sub })
  .setPosition(0, 432, 0);
```

> `singleRow`（队伍 ≤3 人）时 `rowYs = [110]` 由 `Battle.ts` 内联写死，需一并改成 `[105]`；
> 该分支 `SLOT.h` 最大 330，独占一行时与日志面板（-305 顶 = -217.5）间隔足够，无需再调。

### 5.9 敌方舞台底衬（替换 `tierStageColor`）

```ts
const tierStageColor: Record<number, string> = {
  1: '#4A5D63', 2: '#5C5068', 3: '#6E4A55', 4: '#7A4050',
};
```
并把精英标签色 `e.tier >= 3 ? '#e8b0bc' : COLORS.text` 改成 `e.tier >= 3 ? COLORS.gold : COLORS.text`。

### 5.10 编队页顺手改（可选）

`Team.ts` 的「返回战斗」按钮仍在 `y = min(-560, lastBottom - 52)`，与新导航条位置接近。若要把编队页也换成新皮肤：
```ts
makeButton(root, '返回战斗', () => gm.go('battle'), { w: 300, h: 70 })
  .setPosition(0, -620, 0);
```
卡片已走 `makePanel({surface:'paper'})`，无需改动。

---

## 6. 验收清单

- [ ] 27 张 PNG 全部出现在 `assets/resources/ui/`，`.meta` 自动生成且 `type: texture`
- [ ] 控制台无 `resources.load` 失败、无 `Bundle resources doesn't contain` 报错
- [ ] 九宫格拉伸后圆角不失真、描边等宽（重点看 `ui_panel_status` 被拉到 710×72）
- [ ] 血条三态颜色正确：普通暖红 / 精英橙 / 教主深红；我方绿
- [ ] 底部导航无 emoji、5 枚图标线宽一致、当前页为金描边激活态
- [ ] 全屏无纯黑块、无科技蓝紫 `#5b6cff`、无品红残留
- [ ] **灰度自检**：截灰度图，夜底 / 纸舞台 / 主文字三层可分；立绘贴纸不浮在夜里
- [ ] 金色只出现在：状态条数字、波次徽章、主按钮、激活导航、SSR 语义
- [ ] `node tools/verify_algo.mjs` 23 项全过（逻辑层未动，应无回归）
- [ ] web-mobile 与微信小游戏各构建一次，包体增量 <100 KB

---

## 7. 版本与假设

- v1（2026-11-06）：主页 battle 页 27 张切图 + 接入说明；沿用方向 B 色板与已有 3 张面板。
- **AI 生成标注**：9 枚图标由 AI 生成（2026-11-06，high 质量，品红底 → flood-fill 抠图 → 定点重上色），18 张结构件为程序按色板精确绘制。**AI 图需人工精修后方可作为最终素材**，本包已做抠底/去水印/去玫红，但线宽一致性仍建议人工过一遍。
- 假设 1：截图是编队页，按 `GameManager.start() → go('battle')` 判定主页为挂机战斗页（待确认）。
- 假设 2：切图按 **1x** 出，与项目现有 `ui_panel_*.png` 一致（未做 @2x）。
- 假设 3：字体沿用系统字体；标题用霞鹜文楷的决策仍待定。
- 假设 4：Tier 3 特效（SSR 金流光、进化水彩转场）本次不含，待主页验收后再排。
