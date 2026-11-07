// UI 原子组件工厂（代码驱动，零 prefab）
// ⚠️ Tier 1 换肤版 · 方向 B「暮色灵墨」（提案 v2.0，2026-11-04）
// 与原版 API 完全兼容：所有旧导出、旧签名不变，旧页面不改一行即可换肤。
// 新增能力（全部可选）：双面层面板 / 圆角描边 / 按压态 / 立绘纸舞台 / emoji 兜底开关。
// 背景仍用 Graphics 绘制（不依赖任何贴图），立绘仍用 resources 动态加载。

import {
    Node,
    Label,
    Sprite,
    SpriteFrame,
    Texture2D,
    Rect,
    Size,
    Button,
    UITransform,
    Graphics,
    Color,
    Mask,
    resources,
    dynamicAtlasManager,
} from 'cc';

// ─────────────────────────────────────────────────────────────
// 色板 · 暮色灵墨（详见《育灵手札-美术UI风格提案.md》§3）
// 双面层系统：墨面（深）= 环境；纸面（浅）= 内容载体。
// 铁律：立绘永远坐在纸面板上，深底不放裸立绘。
// ─────────────────────────────────────────────────────────────
export const COLORS = {
    // 墨面（深）
    bg: '#1E2A2E',          // 夜底（墨青，微绿相）
    panel: '#273634',       // 墨面面板/页头/导航栏
    line: '#3E5450',        // 墨面描边/分隔线
    text: '#EDE6D4',        // 墨面主文字（暖纸白，禁纯白）
    sub: '#9BA89F',         // 墨面次级文字（对 bg ≈ 5.6:1）
    // 纸面（浅）
    panelPaper: '#E9E2D0',  // 宣纸面板（卡片/弹窗/立绘舞台）
    panelDeep: '#DCD2B8',   // 纸面内嵌区/未获得卡
    linePaper: '#C9BFA6',   // 纸面描边
    ink: '#3E3A30',         // 纸面主文字（对 paper ≈ 9:1）
    paperSub: '#8C8270',    // 纸面次级文字（仅 ≥24px）
    // 双面通用
    btn: '#273634',         // 墨面次级按钮（配 text 暖纸白）
    btnPrimary: '#E0A93F',  // 主按钮 = 灵气金（自动配 ink 深字）
    btnPressed: '#C6922F',  // 金按压态
    btnGreen: '#5FAE57',    // 确认/成功（配白字）
    btnGreenPressed: '#4C9146',
    btnWarn: '#C96A5A',     // 警告/不足（暖红）
    btnWarnPressed: '#B35A4B',
    btnDisabled: '#3A4744', // 禁用态（配 sub 文字）
    gold: '#E0A93F',        // 金语义（SSR/灵石数字/选中）
    danger: '#C96A5A',      // 失败/不足提示
};

// 旧版兼容别名（若老页面引用过这些名字，不炸）
export const RARITY_COLOR_FALLBACK = { N: '#9aa0a6', R: '#5fae57', SR: '#5fb6e6', SSR: '#e0a93f' };

// emoji 兜底开关：正式版必须 false（提案 §2 禁忌 8）
export const UI_DEBUG = { emojiFallback: false };

// 按压态映射：常规色 → 按压色（未登记的颜色按压时统一压暗 12%）
const PRESSED_MAP: Record<string, string> = {
    [COLORS.btnPrimary]: COLORS.btnPressed,
    [COLORS.btnGreen]: COLORS.btnGreenPressed,
    [COLORS.btnWarn]: COLORS.btnWarnPressed,
    [COLORS.btn]: '#31413E',
};

// 圆角档位（750 设计稿）
export const RADIUS = { panel: 24, card: 16, pill: 999 } as const;

// ─────────────────────────────────────────────────────────────
// 基础工具
// ─────────────────────────────────────────────────────────────
export function hexToColor(hex: string): Color {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return new Color(r, g, b, 255);
}

// 颜色向白色混合（t = 0~1），用于立绘底衬渐变「主题色加白 40%」
export function lightenHex(hex: string, t: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    const mix = (c: number) => Math.round(c + (255 - c) * t);
    const to2 = (n: number) => n.toString(16).padStart(2, '0');
    return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

export function newNode(name: string, parent?: Node): Node {
    const n = new Node(name);
    if (parent) parent.addChild(n);
    return n;
}

function ensureUT(n: Node): UITransform {
    let ut = n.getComponent(UITransform);
    if (!ut) ut = n.addComponent(UITransform);
    return ut;
}

// ─────────────────────────────────────────────────────────────
// 背景绘制：圆角填充 + 可选描边 + 可选竖向渐变
// ─────────────────────────────────────────────────────────────
function paintBg(n: Node): void {
    const ut = ensureUT(n);
    let g = n.getComponent(Graphics);
    if (!g) g = n.addComponent(Graphics);
    g.clear();
    const w = ut.width;
    const h = ut.height;
    const x = -w / 2;
    const y = -h / 2;
    const r = Math.min(n['_radius'] ?? RADIUS.panel, Math.min(w, h) / 2);
    const grad = n['_grad'] as { top: string; bottom: string; inset?: number } | undefined;

    if (grad) {
        // 竖向渐变：横向切条模拟（条数固定 24，肉眼平滑且绘制开销可忽略）
        const inset = grad.inset ?? 0;
        const bands = 24;
        const top = hexToColor(grad.top);
        const bottom = hexToColor(grad.bottom);
        const bh = (h - inset * 2) / bands;
        const rr = Math.max(r - inset, 0);
        for (let i = 0; i < bands; i++) {
            const t = bands === 1 ? 0 : i / (bands - 1);
            g.fillColor = new Color(
                Math.round(bottom.r + (top.r - bottom.r) * t),
                Math.round(bottom.g + (top.g - bottom.g) * t),
                Math.round(bottom.b + (top.b - bottom.b) * t),
                255,
            );
            const by = y + inset + (bands - 1 - i) * bh; // 自上而下：i=0 是顶条
            g.roundRect(x + inset, by - bh / 2, w - inset * 2, bh + 0.5, i === 0 || i === bands - 1 ? rr : 0);
            g.fill();
        }
    } else {
        g.fillColor = hexToColor(n['_bg'] || COLORS.panel);
        g.roundRect(x, y, w, h, r);
        g.fill();
    }

    const lineHex = n['_lineColor'] as string | undefined;
    if (lineHex) {
        g.lineWidth = 2.5;
        g.strokeColor = hexToColor(lineHex);
        const inset = grad ? (grad.inset ?? 0) : 0;
        g.roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(r - inset, 0));
        g.stroke();
    }
}

export function setSize(n: Node, w: number, h: number): void {
    ensureUT(n).setContentSize(w, h);
    if (n['_bg'] || n['_grad']) paintBg(n);
}

export function setBg(n: Node, hex: string): void {
    n['_bg'] = hex;
    n['_grad'] = undefined;
    paintBg(n);
}

// 圆角（可选链式）
export function setRadius(n: Node, r: number): Node {
    n['_radius'] = r;
    if (n['_bg'] || n['_grad']) paintBg(n);
    return n;
}

// 描边色（不传则无边框）
export function setLine(n: Node, hex: string | null): Node {
    n['_lineColor'] = hex ?? undefined;
    if (n['_bg'] || n['_grad']) paintBg(n);
    return n;
}

// 竖向渐变背景（top → bottom，可选内缩；与描边配合做「纸舞台」）
export function setGradient(n: Node, topHex: string, bottomHex: string, inset = 0): Node {
    n['_grad'] = { top: topHex, bottom: bottomHex, inset };
    n['_bg'] = n['_bg'] || hexToColor(bottomHex).toHEX();
    paintBg(n);
    return n;
}

// ─────────────────────────────────────────────────────────────
// 文本
// ─────────────────────────────────────────────────────────────
export interface LabelOpts {
    fontSize?: number;
    color?: string;
    align?: number; // 1 = CENTER（HorizontalAlign.CENTER）
    wrapWidth?: number;
}

export function makeLabel(parent: Node, text: string, opts: LabelOpts = {}): Node {
    const n = newNode('label', parent);
    const lab = n.addComponent(Label);
    lab.string = text;
    const fs = opts.fontSize ?? 24;
    lab.fontSize = fs;
    if (opts.color) lab.color = hexToColor(opts.color);
    lab.horizontalAlign = opts.align ?? 1; // 1 = HorizontalAlign.CENTER
    lab.verticalAlign = 1; // 1 = VerticalAlign.CENTER
    if (opts.wrapWidth) {
        lab.enableWrap = true;
        lab.overflow = 3; // 3 = Overflow.RESIZE_HEIGHT（注意：2 是 SHRUNK 会把多行文本缩成一团）
        setSize(n, opts.wrapWidth, fs);
    } else {
        const w = Math.max(text.length * fs * 0.92, 20);
        setSize(n, w, fs * 1.3);
    }
    return n;
}

// ─────────────────────────────────────────────────────────────
// 按钮：圆角 + 描边 + 按压态 + 禁用态
// 文字色自动规则：金底配墨字（对比 ≈6:1），其余底配暖纸白
// ─────────────────────────────────────────────────────────────
export interface ButtonOpts {
    w?: number;
    h?: number;
    fontSize?: number;
    bg?: string;
    textColor?: string;
    disabled?: boolean;
    /** 按压态底色（默认查 PRESSED_MAP，未登记则压暗 12%） */
    pressedBg?: string;
    /** 描边色，默认无 */
    line?: string;
}

export function makeButton(
    parent: Node,
    text: string,
    cb: () => void,
    opts: ButtonOpts = {},
): Node {
    const n = newNode('btn', parent);
    setSize(n, opts.w ?? 220, opts.h ?? 64);
    const bgHex = opts.disabled ? COLORS.btnDisabled : (opts.bg ?? COLORS.btn);
    setBg(n, bgHex);
    setRadius(n, Math.min(RADIUS.panel, (opts.h ?? 64) / 2));
    if (opts.line && !opts.disabled) setLine(n, opts.line);

    const txtColor = opts.disabled
        ? COLORS.sub
        : (opts.textColor ?? (bgHex === COLORS.btnPrimary ? COLORS.ink : COLORS.text));
    const label = makeLabel(n, text, { fontSize: opts.fontSize ?? 26, color: txtColor });
    label['_labelText'] = text;
    label['_labelOpts'] = { fontSize: opts.fontSize ?? 26, color: txtColor };

    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    if (opts.disabled) {
        n['_enabledClick'] = false;
    } else {
        // 按压态：TOUCH_START 换色，TOUCH_END/CANCEL 还原（Transition.NONE 手动档）
        const pressed = opts.pressedBg ?? PRESSED_MAP[bgHex] ?? shadeHex(bgHex, -0.12);
        n.on('touch-start', () => {
            setBg(n, pressed);
            n['_grad'] = undefined;
        });
        const restore = () => setBg(n, bgHex);
        n.on('touch-end', restore);
        n.on('touch-cancel', restore);
        n.on('click', cb);
    }
    return n;
}

// 颜色明度调整（t>0 变亮，t<0 变暗）
export function shadeHex(hex: string, t: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + t))));
    const to2 = (x: number) => x.toString(16).padStart(2, '0');
    return `#${to2(adj(r))}${to2(adj(g))}${to2(adj(b))}`;
}

// ─────────────────────────────────────────────────────────────
// 面板：双面层入口
//   surface 'ink'   = 墨面（深，默认，兼容旧行为：旧行为就是深面板）
//   surface 'paper' = 纸面（宣纸卡片/弹窗/立绘舞台）
//   标准色面板优先用九宫格切图（resources/ui/ui_panel_*.png，SLICED），
//   自定义 bg 色仍走 Graphics 圆角矩形兜底。
// ─────────────────────────────────────────────────────────────
const SPRITE_TYPE_SLICED = 1; // Sprite.SpriteType.SLICED（web-mobile 构建不导出该枚举，用数值）

// 九宫格面板切图加载（1x 图：ink/paper 120×120 border 32；deep 96×96 border 28）
// R4：border 16 不足以包住面板圆角（大面板拉扁弧线），按切图包文档对齐 32/28。
// 注意：本项目 PNG 按 texture 类型导入（无 spriteFrame 子资源，与立绘同坑），
// 因此加载 Texture2D 后运行时包成 SpriteFrame 并设置 capInsets。
// ⚠️ R7 破案：3.8.8 引擎 SpriteFrame **没有 insetBorder 属性**（赋值静默无效，
// _capInsets 恒 0 → SLICED 退化为整图拉伸，R4~R6 所有 border 调参因此全无视觉效果）。
// 必须用 insetLeft/Top/Right/Bottom 四个 setter（各自触发 _calculateSlicedUV）。
const panelSfCache: Record<string, SpriteFrame> = {};
export function loadUiFrame(name: string): Promise<SpriteFrame | null> {
    if (panelSfCache[name]) return Promise.resolve(panelSfCache[name]);
    const border = name === 'ui_panel_deep' ? 28 : 32;
    const toFrame = (tex: Texture2D | null): SpriteFrame | null => {
        if (!tex) return null;
        const frame = new SpriteFrame();
        frame.name = name; // 打标：运行时/验证脚本可分辨 ink/paper/deep
        frame.texture = tex;
        frame.rect = new Rect(0, 0, tex.width, tex.height);
        frame.originalSize = new Size(tex.width, tex.height);
        frame.insetLeft = border;
        frame.insetTop = border;
        frame.insetRight = border;
        frame.insetBottom = border;
        return frame;
    };
    return new Promise((resolve) => {
        resources.load(`ui/${name}/texture`, Texture2D, (err: any, tex: Texture2D) => {
            const frame = toFrame(err || !tex ? null : tex);
            if (frame) panelSfCache[name] = frame;
            resolve(frame);
        });
    });
}

// 预载三张面板切图（GameManager.start 调用；否则首个面板会先走 Graphics 再换切图）
export function preloadUiPanels(): void {
    loadUiFrame('ui_panel_ink');
    loadUiFrame('ui_panel_paper');
    loadUiFrame('ui_panel_deep');
}

// 标准色 → 切图映射（页面传 bg: COLORS.panel 等标准色时同样命中切图）
const SPRITE_PANEL_BY_KEY: Record<string, string> = {
    [COLORS.panel]: 'ui_panel_ink',
    [COLORS.panelPaper]: 'ui_panel_paper',
    [COLORS.panelDeep]: 'ui_panel_deep',
};

// 把节点背景替换为九宫格切图（清掉 Graphics 绘制，禁 trim，见素材包 README §5）
function applyPanelSprite(n: Node, sf: SpriteFrame): void {
    const g = n.getComponent(Graphics);
    if (g) g.destroy();
    n['_bg'] = undefined;
    n['_grad'] = undefined;
    let sp = n.getComponent(Sprite);
    if (!sp) sp = n.addComponent(Sprite);
    sp.type = SPRITE_TYPE_SLICED;
    sp.sizeMode = 0; // CUSTOM：按节点 contentSize 拉伸（九宫格负责圆角/描边不失真）
    sp.trim = false;
    sp.spriteFrame = sf;
}

export function makePanel(
    parent: Node,
    opts: { w?: number; h?: number; bg?: string; surface?: 'ink' | 'paper'; radius?: number } = {},
): Node {
    const n = newNode('panel', parent);
    setSize(n, opts.w ?? 620, opts.h ?? 200);
    const surface = opts.surface ?? (opts.bg ? undefined : 'ink');

    // 切图分支：surface 指定，或 bg 为标准面板色
    let spriteName: string | null = null;
    if (opts.bg) {
        spriteName = SPRITE_PANEL_BY_KEY[opts.bg] ?? null;
    } else if (surface === 'paper') {
        spriteName = 'ui_panel_paper';
    } else if (surface === 'ink') {
        spriteName = 'ui_panel_ink';
    }
    if (spriteName) {
        const cached = panelSfCache[spriteName];
        if (cached) {
            applyPanelSprite(n, cached);
        } else {
            // 未就绪：绝不画 Graphics 兜底——「先以 Graphics 渲染、之后异步换 Sprite」
            // 的节点在 web-mobile 上永不渲染（切图包 v1 踩坑实录），
            // 真机首屏日志面板无底即此因（Graphics 兜底色又与背景几乎同色）。
            // GameManager.start 已等待全部面板切图预载完成，正常时序无空窗。
            loadUiFrame(spriteName).then((sf) => {
                if (sf && n.isValid) applyPanelSprite(n, sf);
            });
        }
        return n;
    }

    // 原 Graphics 路径（自定义颜色 / 兜底）
    if (opts.bg) {
        setBg(n, opts.bg);
    } else if (surface === 'paper') {
        setBg(n, COLORS.panelPaper);
        setLine(n, COLORS.linePaper);
    } else {
        setBg(n, COLORS.panel);
        setLine(n, COLORS.line);
    }
    setRadius(n, opts.radius ?? RADIUS.panel);
    return n;
}

// ─────────────────────────────────────────────────────────────
// 立绘纸舞台：提案 §1 铁律的代码化——立绘坐纸板，板底衬精灵主题色渐变
//   底 = paper 九宫格切图（宣纸纹理，可见于渐变外圈 12px）；
//   衬 = 内缩 12px 的主题色渐变（顶 = 主题色加白 40%，底 = 主题色）；
//   用法：makeSpiritStage(parent, w, h, 精灵主题色hex)，再把 makeSpirit 挂进去
// ─────────────────────────────────────────────────────────────
export function makeSpiritStage(
    parent: Node,
    w: number,
    h: number,
    themeHex: string,
): Node {
    const n = newNode('spiritStage', parent);
    setSize(n, w, h);
    // 纸面切图打底（未就绪空等，不画 Graphics——同 makePanel 的永不渲染陷阱规避）
    const cached = panelSfCache['ui_panel_paper'];
    if (cached) {
        applyPanelSprite(n, cached);
    } else {
        loadUiFrame('ui_panel_paper').then((sf) => {
            if (sf && n.isValid) applyPanelSprite(n, sf);
        });
    }
    // 内缩主题色渐变衬（子节点，位于切图之上、立绘之下）
    const tint = newNode('tint', n);
    setSize(tint, w - 24, h - 24);
    setGradient(tint, lightenHex(themeHex, 0.4), themeHex, 0);
    setRadius(tint, RADIUS.card);
    return n;
}

// ─────────────────────────────────────────────────────────────
// 布局（与原版一致）
// ─────────────────────────────────────────────────────────────
// 纵向流布局：从 startY 向下依次排布子节点（子节点需已 setSize）
export function flowV(parent: Node, items: Node[], startY: number, gap: number, centerX = 0): void {
    let y = startY;
    for (const it of items) {
        it.setPosition(centerX, y, 0);
        y -= it.getComponent(UITransform)!.height + gap;
    }
}

// 横向流布局：从 centerX 向左右依次排布子节点（子节点需已 setSize）
export function flowH(parent: Node, items: Node[], centerY: number, gap: number): void {
    const widths = items.map((it) => it.getComponent(UITransform)!.width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    let x = -total / 2;
    for (let i = 0; i < items.length; i++) {
        const w = widths[i];
        x += w / 2;
        items[i].setPosition(x, centerY, 0);
        x += w / 2 + gap;
    }
}

// 网格布局：每行 cols 个，cellW/cellH 为单元尺寸
export function flowGrid(
    parent: Node,
    items: Node[],
    startY: number,
    cols: number,
    cellW: number,
    cellH: number,
    gap: number,
): void {
    const totalW = cols * cellW + (cols - 1) * gap;
    const startX = -totalW / 2 + cellW / 2;
    for (let i = 0; i < items.length; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = startX + c * (cellW + gap);
        const y = startY - r * (cellH + gap);
        items[i].setPosition(x, y, 0);
    }
}

// ─────────────────────────────────────────────────────────────
// 立绘加载（与原版逻辑一致，仅 emoji 兜底加 UI_DEBUG 开关）
// ─────────────────────────────────────────────────────────────
// 注意：resources/spirits 下的 PNG 在 Cocos 中按 image 导入，主资源类型为 Texture2D
//（meta.userData.type = "texture"，并 redirect 到 texture 子资源），并非 SpriteFrame。
// 因此这里按 Texture2D 加载（必要时再取 texture 子资源），运行时包成 SpriteFrame 显示，
// 避免 resources.load(path, SpriteFrame) 因类型不匹配而返回 null、永久回退到 emoji。
const sfCache: Record<string, SpriteFrame> = {};
export function loadSpiritFrame(path: string): Promise<SpriteFrame | null> {
    if (sfCache[path]) return Promise.resolve(sfCache[path]);
    const toFrame = (tex: Texture2D | null): SpriteFrame | null => {
        if (!tex) return null;
        const frame = new SpriteFrame();
        frame.texture = tex;
        frame.rect = new Rect(0, 0, tex.width, tex.height);
        frame.originalSize = new Size(tex.width, tex.height);
        return frame;
    };
    return new Promise((resolve) => {
        // 首选：texture 子资源路径（resources.load(path, Texture2D) 对 image 资源会报
        // "Bundle resources doesn't contain <path>"，而 path/texture 一定指向 Texture2D）
        resources.load(`${path}/texture`, Texture2D, (err: any, tex: Texture2D) => {
            if (!err && tex) {
                const frame = toFrame(tex);
                if (frame) sfCache[path] = frame;
                resolve(frame);
                return;
            }
            // 兜底：主路径按 Texture2D 取（图被设为非 image 导入时的情形）
            resources.load(path, Texture2D, (err2: any, tex2: Texture2D) => {
                const frame = toFrame(tex2);
                if (frame) sfCache[path] = frame;
                resolve(frame);
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────
// 初生立绘「视觉尺寸」补偿
//   初生图归一化后画布统一 640×960，但角色本身有宽扁/瘦高之分，
//   主体高度仍从 0.55H 到 0.95H 不等；小卡片里宽扁角色会显得偏小。
//   下面按 alpha>16 主体包围盒算一个额外缩放，让主体的显示面积趋近统一。
//   数据由 tools/normalize_initials.py 生成；未登记（觉醒/真灵/敌人/主角）返回 1。
// ─────────────────────────────────────────────────────────────
const SPIRIT_CANVAS_W = 640;
const SPIRIT_CANVAS_H = 960;
const INITIAL_BBOX: Record<string, [number, number]> = {
  cao:    [614, 718],  // 0.75H
  lu:     [617, 655],  // 0.68H
  ye:     [588, 915],  // 0.95H
  hua:    [615, 664],  // 0.69H
  rong:   [615, 532],  // 0.55H（最宽扁，补偿最大）
  ying:   [615, 710],  // 0.74H
  tai:    [615, 627],  // 0.65H
  luling: [615, 699],  // 0.73H
  shou:   [617, 813],  // 0.85H
  lu3:    [561, 913],  // 0.95H
};

/**
 * 小卡片立绘的视觉尺寸补偿系数（1.00 ~ 1.10）。
 * 按外框 contain 后的主体显示面积，向「外框短边² × 0.60」的目标面积靠拢；
 * 只放大不缩小（进化形态本来就更大）。
 * ⚠️ R1（翡翠包）验收：上限从 1.25 收紧到 1.10——打孔金框时代放大超出内窗
 * 会直接穿帮（立绘压到相邻卡/盖住自家血条），宁可统一偏小也不许出框。
 */
export function spiritFitScale(resPath: string, frameW: number, frameH: number): number {
  const id = resPath.split('/').pop() || '';
  const box = INITIAL_BBOX[id];
  if (!box) return 1;
  const ratio = SPIRIT_CANVAS_W / SPIRIT_CANVAS_H;
  let pw = frameW;
  let ph = frameH;
  if (pw / ph > ratio) pw = ph * ratio;
  else ph = pw / ratio;
  const sw = (pw * box[0]) / SPIRIT_CANVAS_W;
  const sh = (ph * box[1]) / SPIRIT_CANVAS_H;
  const area = Math.max(sw * sh, 1);
  const short = Math.min(frameW, frameH);
  const target = short * short * 0.60;
  return Math.max(1, Math.min(1.10, Math.sqrt(target / area)));
}

// 立绘节点：外框恒定 size×size（保证网格/卡片布局整齐），内部 pic 子节点按原图
// 宽高比 contain 等比缩放（立绘多为 2:3 竖版，若直接缩放外框会导致同排卡片大小不一）。
// 加载失败时按 UI_DEBUG.emojiFallback 决定是否显示 emoji 兜底。
// clip=true 时给外框加矩形 Mask 硬裁剪（R1 验收 P0-1：打孔金框内窗时代，
// 立绘任何参数组合都不允许溢出外框——contain 已保证不超，Mask 是第二保险）。
export function makeSpirit(
    parent: Node,
    resPath: string,
    size: number,
    fallbackEmoji: string,
    frameH?: number, // 可选外框高度：详情页等需要竖向大图时用（外框仍恒定，布局用）
    fitScale = 1,    // 可选视觉尺寸补偿：小卡片里让宽扁角色与其他角色看起来一样大
    clip = false,    // 可选硬裁剪：battle 打孔金框卡内立绘开启
): Node {
    const n = newNode('spirit', parent);
    const H = frameH && frameH > 0 ? frameH : size;
    setSize(n, size, H); // 外框恒定：布局定位用它，不随图片比例变化
    if (clip) {
        // Mask.Type.RECT = 0（web-mobile 构建不导出枚举，用数值）；
        // 只裁子节点（pic/emoji），外框尺寸即裁剪窗口
        const mask = n.addComponent(Mask);
        mask.type = 0;
    }
    const em = makeLabel(n, fallbackEmoji, { fontSize: Math.floor(Math.min(size, H) * 0.5) });
    em.setPosition(0, 0, 0);
    if (!UI_DEBUG.emojiFallback) em.active = false; // 正式版：不显示 emoji 兜底
    const pic = newNode('pic', n);
    setSize(pic, size, H);
    loadSpiritFrame(resPath).then((sf) => {
        if (!sf) return;
        // 按原图宽高比 contain 适配：立绘多为 2:3 竖版，直接塞进正方形会被横向拉伸。
        const fw = sf.width || 1;
        const fh = sf.height || 1;
        const ratio = fw / fh;
        let w = size;
        let h = H;
        if (w / h > ratio) {
            h = H;          // 外框比图更"胖"：以高度为准，宽 = 高 × 比例
            w = H * ratio;
        } else {
            w = size;       // 外框比图更"瘦"：以宽度为准，高 = 宽 / 比例
            h = size / ratio;
        }
        // fitScale 只放大图片本身，外框 size×H 不变：网格/卡片布局完全不受影响
        setSize(pic, Math.round(w * fitScale), Math.round(h * fitScale));
        let sp = pic.getComponent(Sprite);
        if (!sp) sp = pic.addComponent(Sprite);
        // sizeMode 用 CUSTOM(0)：按节点 UITransform 的 contentSize 缩放（web-mobile 构建不导出该枚举）
        sp.sizeMode = 0;
        sp.trim = false;
        sp.spriteFrame = sf;
        em.active = false;
    });
    return n;
}

// 给任意节点附加点击响应（加 Button 组件，NONE 过渡避免变形）
export function attachClick(node: Node, cb: () => void): void {
    const btn = node.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    node.on('click', cb);
}

// ─────────────────────────────────────────────────────────────
// 主页切图加载（1x，texture 导入，运行时包 SpriteFrame）
// 与上面 loadUiFrame 同一套坑位写法：必须取 /texture 子资源。
// 九宫格 border 表：键 = 文件名（不含扩展名），值 = 四边内缩 px。
// ⚠️ ui_panel_ink/paper/deep 不在此表——它们只能走 makePanel / loadUiFrame。
// ─────────────────────────────────────────────────────────────
export const UI_BORDER: Record<string, number> = {
    // ⚠️ R7 破案后重新定值（此前 insetBorder 无效、SLICED 从未生效，旧调参全部作废）：
    // 1) border ≥ 源图圆角半径（角区须包住整段弧线，否则弧中段留在中间带被拉出鼓包）；
    // 2) border×2 ≤ 渲染短边（cap 之和不得超过渲染尺寸，否则上下 cap 重叠渲染未定义）；
    // 3) 半圆胶囊图（半径 = 源高/2）border = 半径，且渲染高必须 = 源图高（竖直零中间带，
    //    渲染高度被压缩时上下 cap 重叠）——胶囊无法既内缩高度又保持端头，fill 只做水平内缩。
    ui_panel_status: 32,
    ui_bar_hp_bg: 16,                       // 80×40 圆角矩形（半径≈10）+ 青灰描边
    ui_bar_hp_fill: 20,                     // 80×40 半圆胶囊：渲染高必须恒 40
    ui_bar_unit_bg: 7,                      // 48×14 半圆胶囊：渲染高必须恒 14
    ui_bar_unit_fill: 7,                    // 同上
    ui_chip_hp: 12, ui_mask_dead: 14,
    ui_nav_bar: 32, ui_btn_nav_off: 24, ui_btn_nav_on: 24,
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
        resources.load(`ui/${name}/texture`, Texture2D, (err: unknown, tex: Texture2D) => {
            if (err || !tex) { resolve(null); return; }
            const sf = new SpriteFrame();
            sf.name = name;
            sf.texture = tex;
            sf.rect = new Rect(0, 0, tex.width, tex.height);
            sf.originalSize = new Size(tex.width, tex.height);
            const b = UI_BORDER[name];
            if (b) {
                // R7 破案：insetBorder 属性在 3.8.8 引擎不存在（赋值静默无效），
                // 必须用四个方向 setter 写 _capInsets，否则 SLICED 退化整图拉伸
                sf.insetLeft = b;
                sf.insetTop = b;
                sf.insetRight = b;
                sf.insetBottom = b;
            }
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
    // 关闭动态图集：运行时包装的 SpriteFrame 会被打进图集，
    // 部分 SLICED 小图（chip/血条/导航按钮/图标）在图集上渲染丢失
    dynamicAtlasManager.enabled = false;
    HOME_UI_NAMES.forEach(loadHomeFrame);
}

/** 创建一张切图节点：有 border 走 SLICED(1)，无 border 走 SIMPLE(0)。
 * ⚠️ 实测（Cocos 3.8.8 web-mobile）：节点若先以 Graphics 建立渲染实体、之后换成 Sprite，
 * 该节点会永远不渲染。所以兜底阶段不能画 Graphics，只能空等切图就绪（首帧可能短促无底）。 */
export function makeUiSprite(
    parent: Node, name: string, w: number, h: number,
    fallbackHex = COLORS.panel,
): Node {
    void fallbackHex; // 保留参数兼容旧调用；不再用 Graphics 兜底（见上注释）
    const n = newNode(name, parent);
    setSize(n, w, h);
    const apply = (sf: SpriteFrame): void => {
        if (!n.isValid) return;
        let sp = n.getComponent(Sprite);
        if (!sp) sp = n.addComponent(Sprite);
        sp.type = UI_BORDER[name] ? 1 : 0; // 1 = SLICED, 0 = SIMPLE（web-mobile 不导出枚举，用数值）
        sp.sizeMode = 0;                    // CUSTOM：按 contentSize 拉伸
        sp.trim = false;
        sp.spriteFrame = sf;
        // 异步创建的 Sprite 之前可能被 tintUiSprite 预约过染色（_tintColor 含 alpha）
        if (n['_tintColor']) sp.color = n['_tintColor'];
        else if (n['_tintHex']) sp.color = hexToColor(n['_tintHex']);
    };
    const cached = homeSfCache[name];
    if (cached) {
        apply(cached);
    } else {
        loadHomeFrame(name).then((sf) => { if (sf && n.isValid) apply(sf); });
    }
    return n;
}

/** 白色填充图染色（乘算）：血条三态、我方/敌方血条共用。
 * Sprite 可能由 makeUiSprite 异步创建——未创建时把色值存到节点上，apply 时补染。
 * alpha（0~255）可选：稀有度垫底等半透明染色用（R1 验收 P1-4）。 */
export function tintUiSprite(n: Node, hex: string, alpha = 255): void {
    const c = hexToColor(hex);
    if (alpha !== 255) c.a = alpha;
    const sp = n.getComponent(Sprite);
    if (sp) sp.color = c;
    else n['_tintColor'] = c; // 暂存完整色值（含 alpha），apply 时补染
}

// ═════════════════════════════════════════════════════════════
// ui3 · 翡翠仙境切图包 v1（86 张，tools/jade/README.md）
// 与旧 ui/ 并存可回退。铁律继承：
//  ① PNG 按 texture 导入 + 运行时包 SpriteFrame（border 由代码表控制）；
//  ② 九宫格内缩必须用 insetLeft/Top/Right/Bottom 四向 setter
//    （insetBorder 属性在 3.8.8 引擎不存在，赋值静默无效）；
//  ③ 兜底不画 Graphics（先 Graphics 后 Sprite 的节点永不渲染）；
//  ④ fill 绝不与 bg 同尺寸（内缩 2px 防盖圆头）；禁 trim。
// ═════════════════════════════════════════════════════════════

/** ui3 九宫格 border 表 [left, top, right, bottom]（README §3.4 官方值） */
export const UI3_BORDER: Record<string, [number, number, number, number]> = {
    panel_status: [70, 12, 70, 12],
    panel_title_coral: [40, 16, 40, 16],
    panel_section_jade: [60, 10, 60, 10],
    panel_jade_large: [30, 30, 30, 30],
    panel_log_wide: [40, 14, 40, 14],
    panel_info_jade: [24, 24, 24, 24],
    panel_scenic_banner: [40, 20, 40, 20],
    panel_ivory_wide: [40, 20, 40, 20],
    button_wave: [66, 12, 66, 12],
    chip_hp_red: [16, 10, 16, 10], chip_hp_gold: [16, 10, 16, 10], chip_hp_green: [16, 10, 16, 10],
    bar_fill_red: [10, 6, 10, 6], bar_fill_gold: [10, 6, 10, 6], bar_fill_green: [10, 6, 10, 6],
    bar_track_dark: [13, 0, 13, 0], // R6 新增：中性深墨绿圆头空槽，左右 cap 13、上下不九宫格
    plate_name_red: [36, 10, 36, 10], plate_name_gold: [36, 10, 36, 10], plate_name_green: [36, 10, 36, 10],
    bar_thick_green: [14, 14, 14, 14],
};

function ui3Subdir(name: string): string {
    if (name.startsWith('bg_')) return 'backgrounds';
    if (name.startsWith('panel_')) return 'panels';
    if (name.startsWith('frame_') || name.startsWith('card_')) return 'frames';
    if (name.startsWith('button_')) return 'buttons';
    if (name.startsWith('bar_') || name.startsWith('chip_') || name.startsWith('plate_')) return 'bars';
    if (name.startsWith('tab_')) return 'tabs';
    if (name.startsWith('icon_')) return 'icons';
    return 'decorations';
}

const ui3SfCache: Record<string, SpriteFrame> = {};

/** ui3 切图 → SpriteFrame（texture 路径 + 四向 inset），与 loadHomeFrame 同模式 */
export function loadUi3Frame(name: string): Promise<SpriteFrame | null> {
    if (ui3SfCache[name]) return Promise.resolve(ui3SfCache[name]);
    return new Promise((resolve) => {
        resources.load(`ui3/${ui3Subdir(name)}/${name}/texture`, Texture2D, (err: unknown, tex: Texture2D) => {
            if (err || !tex) { resolve(null); return; }
            const sf = new SpriteFrame();
            sf.name = name;
            sf.texture = tex;
            sf.rect = new Rect(0, 0, tex.width, tex.height);
            sf.originalSize = new Size(tex.width, tex.height);
            const b = UI3_BORDER[name];
            if (b) {
                sf.insetLeft = b[0];
                sf.insetTop = b[1];
                sf.insetRight = b[2];
                sf.insetBottom = b[3];
            }
            ui3SfCache[name] = sf;
            resolve(sf);
        });
    });
}

/** battle 主页用到的 ui3 切图清单（预载防首屏空窗） */
export const UI3_NAMES = [
    'bg_spirit_realm_main',
    'panel_status', 'panel_title_coral', 'panel_section_jade', 'panel_jade_large',
    'button_wave',
    'chip_hp_red', 'chip_hp_gold', 'chip_hp_green',
    'bar_fill_red', 'bar_fill_gold', 'bar_fill_green',
    'bar_track_dark', // R6 新增中性空槽，预载防首屏空窗
    'bar_thick_green',
    'plate_name_gold', 'plate_name_red', 'plate_name_green',
    'frame_spirit_card', 'card_plate_cloud',
    'button_nav_team', 'button_nav_gacha', 'button_nav_dex', 'button_nav_shop', 'button_nav_hero',
    'icon_stone', 'icon_jade', 'icon_talisman', 'icon_moon',
    'deco_divider_gold', 'deco_lotus_white', 'deco_cloud_a',
];

export function preloadUi3(): Promise<void> {
    dynamicAtlasManager.enabled = false; // 同 ui/：运行时包 frame 禁动态图集
    return Promise.all(UI3_NAMES.map(loadUi3Frame)).then(() => undefined);
}

/** ui3 切图节点：有 border 走 SLICED(1)，无 border 走 SIMPLE(0)。
 * 安全模式同 makeUiSprite：无 Graphics 兜底，空等切图就绪。
 * R6：第 5 参数 spriteType 可覆盖渲染类型（3 = FILLED，单位血条用），
 * 避免「按 ratio 变宽 + 左右 cap 各 10px」在 w<20 时九宫格退化、端头畸变。
 * ⚠️ 覆盖必须在 apply 内完成：切图异步就绪时 apply 晚于函数返回，
 *    返回后再写 sp.type 会被这里静默覆盖回去。 */
export function makeUi3Sprite(
    parent: Node, name: string, w: number, h: number,
    spriteType?: number,
): Node {
    const n = newNode(name, parent);
    setSize(n, w, h);
    const apply = (sf: SpriteFrame): void => {
        if (!n.isValid) return;
        let sp = n.getComponent(Sprite);
        if (!sp) sp = n.addComponent(Sprite);
        const type = spriteType !== undefined ? spriteType : (UI3_BORDER[name] ? 1 : 0);
        sp.type = type;      // 0 = SIMPLE, 1 = SLICED, 3 = FILLED
        sp.sizeMode = 0;     // 0 = CUSTOM
        sp.trim = false;
        sp.spriteFrame = sf;
        if (type === 3) {
            // FILLED：横向从左向右裁切（枚举在 web-mobile 不导出，一律用数值）
            sp.fillType = 0;  // 0 = HORIZONTAL
            sp.fillStart = 0;
            sp.fillRange = n['_fillRange'] !== undefined ? n['_fillRange'] : 1;
        }
        if (n['_tintColor']) sp.color = n['_tintColor'];
        else if (n['_tintHex']) sp.color = hexToColor(n['_tintHex']);
    };
    const cached = ui3SfCache[name];
    if (cached) {
        apply(cached);
    } else {
        loadUi3Frame(name).then((sf) => { if (sf) apply(sf); });
    }
    return n;
}

/** R6：FILLED 血条按血量比例裁切（节点恒为满宽圆头胶囊，不再 setSize 变宽）。
 * 暂存 _fillRange，切图异步就绪时 apply 也能还原到正确比例。 */
export function setUi3FillRange(n: Node, ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    n['_fillRange'] = r;
    const sp = n.getComponent(Sprite);
    if (sp) sp.fillRange = r;
}
