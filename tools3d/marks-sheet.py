# The hunter's marks in the live HUD (tools3d/review-marks.mjs): one row per
# frame, the whole screen beside the HUD panel at screen pixels.
# Usage: python3 tools3d/marks-sheet.py <dir> <area> <out.jpg>
import json, os, sys
from PIL import Image, ImageDraw

root, area, out = sys.argv[1], sys.argv[2], sys.argv[3]
report = json.load(open(os.path.join(root, f'{area}-marks.json')))
W = 720
rows = []
for frame in report['frames']:
    im = Image.open(os.path.join(root, f"{area}-{frame['name']}.png")).convert('RGB')
    full = im.resize((W, round(W * im.height / im.width)), Image.LANCZOS)
    hud = im.crop((0, 0, 470, 300))
    row = Image.new('RGB', (W + hud.width + 8, max(full.height, hud.height) + 22), (16, 16, 16))
    d = ImageDraw.Draw(row)
    said = f"  ·  callout: \"{frame['callout']}\"" if frame.get('callout') else ''
    d.text((4, 4), f"{frame['note']}{said}", fill=(240, 236, 214))
    row.paste(full, (0, 22)); row.paste(hud, (W + 8, 22))
    rows.append(row)
sheet = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows)), (16, 16, 16))
y = 0
for r in rows:
    sheet.paste(r, (0, y)); y += r.height
sheet.save(out, quality=80)
print(out, sheet.size, f'{os.path.getsize(out) // 1024} KB')
