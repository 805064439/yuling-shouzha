# -*- coding: utf-8 -*-
# 绿幕立绘抠像工具：绿幕 → 透明底，缩放到统一规格，输出到 assets/resources/spirits/。
# 用法: python tools/key_green.py <输入.png> <输出名.png> [宽 高]
# 规则: g 明显高于 max(r,b) 判为绿幕；边缘半透明过渡；超绿像素做 despill 去绿边。
import sys
import numpy as np
from PIL import Image

def key_green(src, dst, w=640, h=960):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dom = g - np.maximum(r, b)  # 绿色支配度
    # alpha 渐变：dom<=10 全不透明，>=70 全透明，中间线性过渡（保留发丝/薄纱边缘）
    alpha = np.clip((70.0 - dom) / 60.0, 0.0, 1.0)
    # despill：绿色超过红蓝均值的部分压回，去绿边
    avg = (r + b) * 0.5
    g2 = np.minimum(g, np.maximum(avg, g - (dom - 10) * 0.5))
    out = np.stack([r, g2, b, alpha * 255.0], axis=-1).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    img = img.resize((w, h), Image.LANCZOS)
    # 缩放后再清理：边缘残留的低alpha噪点归零，避免白边
    arr = np.asarray(img).astype(np.float32)
    arr[..., 3] = np.where(arr[..., 3] < 12, 0, arr[..., 3])
    Image.fromarray(arr.astype(np.uint8), 'RGBA').save(dst, optimize=True)
    print(f'{src} -> {dst} {w}x{h} ok')

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 640
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 960
    key_green(src, dst, w, h)
