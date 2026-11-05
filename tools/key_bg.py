# -*- coding: utf-8 -*-
# 立绘抠像工具（通用背景色版）：自动取四角中位色为幕布色，按色距渐变抠图，去色边。
# 用法: python tools/key_bg.py <输入.png> <输出名.png> [宽 高]
# 支持绿幕/青幕等纯色背景；输出统一缩放规格（默认 640×960）。
import sys
import numpy as np
from PIL import Image

def key_bg(src, dst, w=640, h=960):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    h0, w0 = a.shape[:2]
    # 取四角各 24×24 块的中位色作为幕布色
    corners = np.concatenate([
        a[:24, :24].reshape(-1, 3), a[:24, -24:].reshape(-1, 3),
        a[-24:, :24].reshape(-1, 3), a[-24:, -24:].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0)
    # 色距渐变 alpha：d<=30 全透明，>=110 全不透明，中间线性过渡
    d = np.sqrt(((a - bg) ** 2).sum(axis=-1))
    alpha = np.clip((d - 30.0) / 80.0, 0.0, 1.0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # despill：按幕布类型压回溢出通道（绿幕压 g；青幕把 g/b 压向 r）
    if bg[1] > bg[0] + 60 and bg[1] >= bg[2]:  # 绿幕
        avg = (r + b) * 0.5
        g = np.minimum(g, np.maximum(avg, g - (g - np.maximum(r, b) - 10) * 0.5))
    elif bg[1] > bg[0] + 60 and bg[2] > bg[0] + 60:  # 青幕
        excess = np.minimum(g, b) - r
        m = excess > 10
        g = np.where(m, np.maximum(r, g - excess * 0.5), g)
        b = np.where(m, np.maximum(r, b - excess * 0.5), b)
    elif bg[0] > bg[1] + 60 and bg[2] > bg[1] + 60:  # 品红/紫幕：把溢出的 r/b 压向 g（力度加强，发丝边缘残留多）
        excess = np.minimum(r, b) - g
        m = excess > 6
        r = np.where(m, np.maximum(g, r - excess * 0.8), r)
        b = np.where(m, np.maximum(g, b - excess * 0.8), b)
    out = np.stack([r, g, b, alpha * 255.0], axis=-1).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA').resize((w, h), Image.LANCZOS)
    # 清理缩放后的低 alpha 噪点，避免边缘白/彩边
    arr = np.asarray(img).astype(np.float32)
    arr[..., 3] = np.where(arr[..., 3] < 12, 0, arr[..., 3])
    Image.fromarray(arr.astype(np.uint8), 'RGBA').save(dst, optimize=True)
    print(f'{src} -> {dst} {w}x{h} bg={bg.astype(int).tolist()} ok')

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 640
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 960
    key_bg(src, dst, w, h)
