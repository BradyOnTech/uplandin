# Before/after postcard sheet for one ground: for each tier and hour, a row
# of the before label's views over a row of the after label's.
# Usage: python3 tools3d/before-after-sheet.py <dir> <ground> <before> <after> <out.jpg> [frame width]
import sys, os, glob
from PIL import Image, ImageDraw
root, ground, before, after, out = sys.argv[1:6]
W = int(sys.argv[6]) if len(sys.argv) > 6 else 400
H = W * 9 // 16
rows = []
for cfg in ['high-morning', 'lite-morning', 'high-evening', 'lite-evening']:
    for label in (before, after):
        files = sorted(glob.glob(f'{root}/{ground}/{label}-{cfg}-*.png'))
        if files: rows.append((label, cfg, files))
cols = max(len(r[2]) for r in rows)
sheet = Image.new('RGB', (cols * W, len(rows) * (H + 16)), (24, 24, 24))
d = ImageDraw.Draw(sheet)
for r, (label, cfg, files) in enumerate(rows):
    for c, f in enumerate(files):
        sheet.paste(Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS), (c * W, r * (H + 16) + 16))
        view = os.path.basename(f)[len(label) + len(cfg) + 2:-4]
        d.text((c * W + 4, r * (H + 16) + 2), f'{label} {cfg} {view}', fill=(235, 235, 235))
sheet.save(out, quality=80)
print(out, sheet.size, os.path.getsize(out) // 1024, 'KB')
