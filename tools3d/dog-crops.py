# Side-by-side crops round the pointing dog from tools3d/cover-review.mjs
# --dogdiff reports, enlarged, one row per report and one column per style.
# Usage: python3 tools3d/dog-crops.py <out.jpg> <distance> <report.json> [...]
import sys, os, json
from PIL import Image, ImageChops, ImageDraw
out, distance, reports = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
CW, CH, SCALE = 260, 146, 3
rows = []
for path in reports:
    report = json.load(open(path)); root = os.path.dirname(path)
    frames = [f for f in report['frames'] if f['d'] == distance and f.get('nodog')]
    rows.append((report, root, frames))
cols = max(len(r[2]) for r in rows)
sheet = Image.new('RGB', (cols * CW * SCALE, len(rows) * (CH * SCALE + 22)), (24, 24, 24))
d = ImageDraw.Draw(sheet)
for r, (report, root, frames) in enumerate(rows):
    for c, f in enumerate(frames):
        a = Image.open(os.path.join(root, f['file'])).convert('RGB')
        b = Image.open(os.path.join(root, f['nodog'])).convert('RGB')
        box = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 18 else 0).getbbox()
        cx, cy = ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2) if box else (a.width // 2, a.height // 2)
        crop = a.crop((cx - CW // 2, cy - CH // 2, cx + CW // 2, cy + CH // 2)).resize((CW * SCALE, CH * SCALE), Image.NEAREST)
        y = r * (CH * SCALE + 22)
        sheet.paste(crop, (c * CW * SCALE, y + 22))
        d.text((c * CW * SCALE + 6, y + 5), f"{f['style']}  {report['quality']}  dog at {distance} m", fill=(235, 235, 235))
sheet.save(out, quality=85)
print(out, sheet.size, os.path.getsize(out) // 1024, 'KB')
