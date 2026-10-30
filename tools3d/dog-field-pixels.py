# Visible dog pixels from tools3d/dog-field-check.mjs frames, counted only
# in a box round the dog's projected position (1.4 m either side at that
# distance and lens): the wind sways the grass between the with- and
# without-dog renders, so a whole-frame difference counts sway as dog.
# Usage: python3 tools3d/dog-field-pixels.py <report.json> [...]
import sys, os, json, math
from PIL import Image, ImageChops
def lum(p): return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255
for path in sys.argv[1:]:
    report = json.load(open(path)); root = os.path.dirname(path)
    print('==', path)
    for f in sorted(report['frames'], key=lambda f: (f['style'], f['d'])):
        a = Image.open(os.path.join(root, f['file'])).convert('RGB'); b = Image.open(os.path.join(root, f['nodog'])).convert('RGB')
        px = 540 / math.tan(math.radians(f['fov']) / 2)  # px per unit tangent at 1080 p
        half = int(max(24, 1.4 * px / f['metres']))      # 1.4 m either side of the dog
        cx, cy = int(f['dogScreen']['x']), int(f['dogScreen']['y'])
        box = (max(0, cx - half), max(0, cy - half), min(a.width, cx + half), min(a.height, cy + half))
        da, db = a.crop(box), b.crop(box)
        m = ImageChops.difference(da, db).convert('L').point(lambda v: 255 if v > 18 else 0)
        pa, pb, pm = da.load(), db.load(), m.load(); count = 0; contrast = 0
        for y in range(m.height):
            for x in range(m.width):
                if pm[x, y]: count += 1; contrast += abs(lum(pa[x, y]) - lum(pb[x, y]))
        bb = m.getbbox(); h = bb[3] - bb[1] if bb else 0
        print(f"{f['style']:22s} {f['d']} yd  dog {count:5d} px  tall {h:3d} px  contrast {contrast / max(1, count):.3f}")
