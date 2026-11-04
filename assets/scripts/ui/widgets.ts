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
    resources,
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
        lab.overflow = 2; // 2 = Overflow.RESIZE_HEIGHT
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

// 九宫格面板切图加载（1x 图：ink/paper 120×120 border 16pt；deep 96×96 border 14pt）
// 注意：本项目 PNG 按 texture 类型导入（无 spriteFrame 子资源，与立绘同坑），
// 因此加载 Texture2D 后运行时包成 SpriteFrame 并设置 insetBorder。
const panelSfCache: Record<string, SpriteFrame> = {};
export function loadUiFrame(name: string): Promise<SpriteFrame | null> {
    if (panelSfCache[name]) return Promise.resolve(panelSfCache[name]);
    const border = name === 'ui_panel_deep' ? 14 : 16;
    const toFrame = (tex: Texture2D | null): SpriteFrame | null => {
        if (!tex) return null;
        const frame = new SpriteFrame();
        frame.name = name; // 打标：运行时/验证脚本可分辨 ink/paper/deep
        frame.texture = tex;
        frame.rect = new Rect(0, 0, tex.width, tex.height);
        frame.originalSize = new Size(tex.width, tex.height);
        frame.insetBorder = new Rect(border, border, border, border);
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
            // 未预载完成：先 Graphics 色板兜底，切图就绪后替换（节点可能已被销毁，判 isValid）
            const fallback = opts.bg ?? (surface === 'paper' ? COLORS.panelPaper : COLORS.panel);
            setBg(n, fallback);
            setLine(n, surface === 'paper' ? COLORS.linePaper : COLORS.line);
            setRadius(n, opts.radius ?? RADIUS.panel);
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
    // 纸面切图打底（未就绪先 Graphics 色板兜底，加载后替换）
    const cached = panelSfCache['ui_panel_paper'];
    if (cached) {
        applyPanelSprite(n, cached);
    } else {
        setBg(n, COLORS.panelPaper);
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

// 立绘节点：外框恒定 size×size（保证网格/卡片布局整齐），内部 pic 子节点按原图
// 宽高比 contain 等比缩放（立绘多为 2:3 竖版，若直接缩放外框会导致同排卡片大小不一）。
// 加载失败时按 UI_DEBUG.emojiFallback 决定是否显示 emoji 兜底。
export function makeSpirit(
    parent: Node,
    resPath: string,
    size: number,
    fallbackEmoji: string,
    frameH?: number, // 可选外框高度：详情页等需要竖向大图时用（外框仍恒定，布局用）
): Node {
    const n = newNode('spirit', parent);
    const H = frameH && frameH > 0 ? frameH : size;
    setSize(n, size, H); // 外框恒定：布局定位用它，不随图片比例变化
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
        setSize(pic, Math.round(w), Math.round(h));
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
