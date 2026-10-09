# Dog readability from tools3d/cover-review.mjs --dogdiff frames: how many
# pixels of the pointing dog the cover leaves visible, and how far they
# stand from the cover behind them (mean Rec.709 luminance difference).
# Usage: python3 tools3d/dog-pixels.py <report.json>
import sys, os, json
from PIL import Image, ImageChops
report = json.load(open(sys.argv[1]))
root = os.path.dirname(sys.argv[1])
def lum(p): return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255
for f in report['frames']:
    if not f.get('nodog'): continue
    a = Image.open(os.path.join(root, f['file'])).convert('RGB')
    b = Image.open(os.path.join(root, f['nodog'])).convert('RGB')
    diff = ImageChops.difference(a, b).convert('L')
    mask = diff.point(lambda v: 255 if v > 18 else 0)
    box = mask.getbbox()
    pa, pb, pm = a.load(), b.load(), mask.load()
    count, contrast = 0, 0.0
    if box:
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]):
                if pm[x, y]:
                    count += 1; contrast += abs(lum(pa[x, y]) - lum(pb[x, y]))
    height = (box[3] - box[1]) if box else 0
    print(f"{f['style']:8s} {f['d']:4d} m  visible dog {count:5d} px  height {height:3d} px  contrast {contrast / max(1, count):.3f}")
