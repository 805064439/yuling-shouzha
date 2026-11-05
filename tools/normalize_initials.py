# -*- coding: utf-8 -*-
"""初生立绘视觉尺寸归一化。

背景：觉醒/真灵立绘由 key_bg.py 抠像后统一输出 640x960，主体几乎铺满画布
（bbox 约占 0.95W x 0.97H）；而初生立绘是用户直接提供的原图，主体占比从
0.49H 到 0.97H 不等，卡片里看起来「有的大有的小」。

做法（与 key_bg.py 的成图规格完全一致）：
  1. 按 alpha>16 求主体包围盒，裁掉透明边（留 1% 羽化余量）；
  2. 等比放大到统一 640x960 画布的 0.98W x 0.97H 内框（取 min 比例，不拉伸）；
  3. 居中贴回透明画布。

跑完后所有初生图与觉醒/真灵同规格、同填充规则，任意页面 contain 适配时
缩放系数一致。归一化后的主体 bbox 会打印出来，用于 widgets.ts 的
INITIAL_BBOX（小卡片里的视觉面积补偿）。

用法: python tools/normalize_initials.py [--dry]
原图自动备份到 pending_art/initials_orig_20261105/（该目录已 gitignore）。
"""
import os
import shutil
import sys
import glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'assets', 'resources', 'spirits')
BACKUP = os.path.join(ROOT, 'pending_art', 'initials_orig_20261105')
PREVIEW = os.path.join(ROOT, 'pending_art', 'initials_norm_preview.jpg')

# 10 只精怪的初生图（不含 protagonist / 觉醒 / 真灵）
IDS = ['cao', 'lu', 'ye', 'hua', 'rong', 'ying', 'tai', 'luling', 'shou', 'lu3']

W, H = 640, 960
INNER_W, INNER_H = round(W * 0.98), round(H * 0.97)  # 627 x 931
ALPHA_TH = 16


def bbox_of(im):
    a = im.getchannel('A').point(lambda p: 255 if p > ALPHA_TH else 0)
    return a.getbbox()


def normalize(path, dry=False):
    im = Image.open(path).convert('RGBA')
    bb = bbox_of(im)
    if not bb:
        print(f'  !! {os.path.basename(path)} 全透明，跳过')
        return None
    # 1% 羽化余量，避免切掉边缘半透明像素
    pad_x, pad_y = max(2, round((bb[2] - bb[0]) * 0.01)), max(2, round((bb[3] - bb[1]) * 0.01))
    box = (max(0, bb[0] - pad_x), max(0, bb[1] - pad_y),
           min(im.width, bb[2] + pad_x), min(im.height, bb[3] + pad_y))
    crop = im.crop(box)
    cw, ch = crop.size
    k = min(INNER_W / cw, INNER_H / ch)
    nw, nh = max(1, round(cw * k)), max(1, round(ch * k))
    body = crop.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(body, ((W - nw) // 2, (H - nh) // 2))
    out = bbox_of(canvas)
    ow, oh = out[2] - out[0], out[3] - out[1]
    print(f'  {os.path.basename(path):14s} {im.width}x{im.height} bbox={cw}x{ch} '
          f'-> {nw}x{nh}  fracW={ow / W:.2f} fracH={oh / H:.2f}  BBOX=[{ow}, {oh}]')
    if not dry:
        canvas.save(path, optimize=True)
    return canvas


def main():
    dry = '--dry' in sys.argv
    os.makedirs(BACKUP, exist_ok=True)
    sheets = []
    for sid in IDS:
        p = os.path.join(SRC_DIR, sid + '.png')
        if not os.path.exists(p):
            print(f'  !! 缺少 {p}')
            continue
        dst = os.path.join(BACKUP, sid + '.png')
        if not os.path.exists(dst):
            shutil.copy2(p, dst)
        img = normalize(p, dry)
        if img:
            sheets.append((sid, img))
    # 对比拼图（浅灰底，模拟宣纸卡片）
    if sheets:
        cell_w, cell_h = 200, 300
        sheet = Image.new('RGB', (cell_w * 5, cell_h * 2), (233, 226, 208))
        for i, (sid, img) in enumerate(sheets):
            thumb = img.copy()
            thumb.thumbnail((cell_w - 20, cell_h - 20), Image.LANCZOS)
            x = (i % 5) * cell_w + (cell_w - thumb.width) // 2
            y = (i // 5) * cell_h + (cell_h - thumb.height) // 2
            sheet.paste(thumb, (x, y), thumb)
        sheet.save(PREVIEW, quality=88)
        print(f'\n预览拼图: {PREVIEW}')
    if dry:
        print('\n[dry-run] 未写入任何文件')


if __name__ == '__main__':
    main()
