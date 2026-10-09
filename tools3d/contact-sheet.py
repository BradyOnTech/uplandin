# Contact sheets from tools3d/postcards.sh: one per ground, rows High morning / Lightweight morning / High evening
# (and Lightweight evening when it was captured).
# Usage: python3 tools3d/contact-sheet.py <label> [postcards dir]
import sys, os, glob
from PIL import Image, ImageDraw
label = sys.argv[1]; root = sys.argv[2] if len(sys.argv) > 2 else '/tmp/uplandin-campaign/postcards'
W = 480; H = 270
for area in sorted(os.listdir(root)):
    rows = []
    for cfg in ['high-morning', 'lite-morning', 'high-evening', 'lite-evening']:
        files = sorted(glob.glob(f'{root}/{area}/{label}-{cfg}-*.png'))
        if files: rows.append((cfg, files))
    if not rows: continue
    cols = max(len(f) for _, f in rows)
    sheet = Image.new('RGB', (cols * W, len(rows) * (H + 18)), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    for r, (cfg, files) in enumerate(rows):
        for c, f in enumerate(files):
            im = Image.open(f).convert('RGB').resize((W, H))
            sheet.paste(im, (c * W, r * (H + 18) + 18))
            d.text((c * W + 4, r * (H + 18) + 3), f'{cfg} {os.path.basename(f)[len(label)+len(cfg)+2:-4]}', fill=(230, 230, 230))
    out = f'{root}/{area}-{label}-sheet.jpg'
    sheet.save(out, quality=85); print(out)
