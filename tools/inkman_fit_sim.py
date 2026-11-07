# -*- coding: utf-8 -*-
# 血砚先生「左右被裁」诊断与完整显示方案仿真（只读正式资源，输出全部落在 tools/inkman/）。
# 用法: python tools/inkman_fit_sim.py
# 复刻 makeSpirit 的 contain 适配 + Battle.ts 的 fitScale，把候选图叠到真实金框卡上对比。
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from key_bg import key_bg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools', 'inkman')
os.makedirs(OUT, exist_ok=True)
RAW = os.path.join(ROOT, 'pending_art', 'enemies_v2_67_20261106', '07_e_inkman_raw.png')
CUR = os.path.join(ROOT, 'assets', 'resources', 'enemies', 'e_inkman.png')
FRAME = Image.open(os.path.join(ROOT, 'assets', 'resources', 'ui3', 'frames', 'frame_spirit_card.png')).convert('RGBA')

# 候选 A：沿用现有脚本 fit='contain' 输出竖版 640×960 —— 完整，但人物被压成中间一条带
A = os.path.join(OUT, 'cand_A_contain640.png')
key_bg(RAW, A, 640, 960, 'contain')
# 候选 B：近方形画布 1024×1024 —— 完整，运行时按宽 contain 自动撑满内窗
B = os.path.join(OUT, 'cand_B_wide1024.png')
key_bg(RAW, B, 1024, 1024, 'contain')

CARD_W, CARD_H = 186, 240
INNER_W, INNER_H = 158, 176
CY = 14  # Battle.ts INNER.cy：内窗中心偏上 14 设计px


def simulate(png, fit_scale):
    """复刻 widgets.ts makeSpirit 的 contain 分支 + fitScale，叠到金框卡上。"""
    im = Image.open(png).convert('RGBA')
    ratio = im.width / im.height
    w, h = INNER_W, INNER_H
    if w / h > ratio:          # 外框比图「胖」：以高度为准
        h = INNER_H
        w = INNER_H * ratio
    else:                       # 外框比图「瘦」：以宽度为准
        w = INNER_W
        h = INNER_W / ratio
    w, h = round(w * fit_scale), round(h * fit_scale)
    pic = im.resize((w, h), Image.LANCZOS)

    card = Image.new('RGBA', (CARD_W, CARD_H), (196, 219, 213, 255))  # 模拟 card_plate_cloud 垫底
    card.alpha_composite(FRAME.resize((CARD_W, CARD_H), Image.LANCZOS))
    cx, cy = CARD_W // 2, CARD_H // 2 - CY
    card.alpha_composite(pic, (cx - w // 2, cy - h // 2))
    return card, (w, h)


CASES = [
    ('当前 cover .90 (640x960)', CUR, 1.20),
    ('A contain 640x960 / fit1.20', A, 1.20),
    ('B 方形 1024 / fit1.00', B, 1.00),
    ('B 方形 1024 / fit1.20', B, 1.20),
]

SCALE = 2
PAD, LABEL_H = 24, 62
cards = []
for label, png, fs in CASES:
    c, (w, h) = simulate(png, fs)
    cards.append((label, c, (w, h), fs))
    print(f'{label}: pic={w}x{h} 内窗={INNER_W}x{INNER_H} '
          f'横向溢出={max(0, w-INNER_W)//2}px/边 纵向溢出={max(0, h-INNER_H)//2}px/边')

cw, ch = CARD_W * SCALE, CARD_H * SCALE
total_w = PAD + len(cards) * (cw + PAD)
total_h = PAD + ch + LABEL_H + PAD
sheet = Image.new('RGB', (total_w, total_h), (246, 243, 232))
draw = ImageDraw.Draw(sheet)
for i, (label, c, (w, h), fs) in enumerate(cards):
    x = PAD + i * (cw + PAD)
    sheet.paste(c.resize((cw, ch), Image.LANCZOS).convert('RGB'), (x, PAD))
    draw.text((x, PAD + ch + 6), label, fill=(40, 52, 48))
    draw.text((x, PAD + ch + 24), f'fit={fs}  pic={w}x{h}', fill=(96, 106, 100))
    draw.text((x, PAD + ch + 40),
              f'溢出 {max(0,w-INNER_W)//2}px/边' if w > INNER_W else '不出框',
              fill=(150, 90, 60))
sheet.save(os.path.join(OUT, 'compare.png'))
print('->', os.path.join(OUT, 'compare.png'))
