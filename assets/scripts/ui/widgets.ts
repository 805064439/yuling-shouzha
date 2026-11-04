// UI 原子组件工厂（代码驱动，零 prefab）
// 用 Cocos 3.8 稳定 API 动态创建 Label / Button / Panel / Sprite / 布局。
// 背景用 Graphics 纯色绘制（不依赖任何内置/外部贴图），立绘用 resources 动态加载。

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

export const COLORS = {
  bg: '#1a1c2e',
  panel: '#262a44',
  btn: '#3a3f63',
  btnPrimary: '#5b6cff',
  btnWarn: '#e0a93f',
  text: '#e8e8f0',
  sub: '#9aa0c0',
  line: '#3a3f63',
};

export function hexToColor(hex: string): Color {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return new Color(r, g, b, 255);
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

function paintBg(n: Node): void {
  const ut = ensureUT(n);
  let g = n.getComponent(Graphics);
  if (!g) g = n.addComponent(Graphics);
  g.clear();
  g.fillColor = hexToColor(n['_bg'] || COLORS.panel);
  g.fillRect(-ut.width / 2, -ut.height / 2, ut.width, ut.height);
}

export function setSize(n: Node, w: number, h: number): void {
  ensureUT(n).setContentSize(w, h);
  if (n['_bg']) paintBg(n);
}

export function setBg(n: Node, hex: string): void {
  n['_bg'] = hex;
  paintBg(n);
}

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

export interface ButtonOpts {
  w?: number;
  h?: number;
  fontSize?: number;
  bg?: string;
  textColor?: string;
  disabled?: boolean;
}

export function makeButton(
  parent: Node,
  text: string,
  cb: () => void,
  opts: ButtonOpts = {},
): Node {
  const n = newNode('btn', parent);
  setSize(n, opts.w ?? 220, opts.h ?? 64);
  setBg(n, opts.bg ?? COLORS.btn);
  makeLabel(n, text, {
    fontSize: opts.fontSize ?? 26,
    color: opts.textColor ?? COLORS.text,
  });
  const btn = n.addComponent(Button);
  btn.transition = Button.Transition.NONE;
  if (opts.disabled) n.active = false;
  n.on('click', cb);
  return n;
}

export function makePanel(parent: Node, opts: { w?: number; h?: number; bg?: string } = {}): Node {
  const n = newNode('panel', parent);
  setSize(n, opts.w ?? 620, opts.h ?? 200);
  setBg(n, opts.bg ?? COLORS.panel);
  return n;
}

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

// 立绘加载（带缓存）
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

// 立绘节点：加载成功后显示立绘，否则回退 emoji（不阻塞布局）
export function makeSpirit(
  parent: Node,
  resPath: string,
  size: number,
  fallbackEmoji: string,
): Node {
  const n = newNode('spirit', parent);
  setSize(n, size, size);
  const em = makeLabel(n, fallbackEmoji, { fontSize: Math.floor(size * 0.5) });
  em.setPosition(0, 0, 0);
  loadSpiritFrame(resPath).then((sf) => {
    if (!sf) return;
    // 按原图宽高比 contain 适配：立绘多为 2:3 竖版，直接塞进正方形节点会被横向拉伸。
    // 以 size 为上限，等比缩放后重设节点尺寸（锚点 0.5，仍在原位置居中）。
    const fw = sf.width || 1;
    const fh = sf.height || 1;
    const ratio = fw / fh;
    let w = size;
    let h = size;
    if (ratio >= 1) {
      h = size / ratio; // 横图
    } else {
      w = size * ratio; // 竖图
    }
    setSize(n, Math.round(w), Math.round(h));
    let sp = n.getComponent(Sprite);
    if (!sp) sp = n.addComponent(Sprite);
    // 关键：sizeMode 用 CUSTOM(0)，Sprite 默认按贴图原始尺寸渲染，
    // 立绘原图 1024×1024 会铺满屏幕；CUSTOM 才会按节点 UITransform 的 contentSize 缩放。
    sp.sizeMode = 0; // 0 = Sprite.SizeMode.CUSTOM（web-mobile 构建不导出该枚举，用数值）
    sp.trim = false; // 运行时包装的 SpriteFrame 无 trim 数据，关掉避免裁切异常
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
