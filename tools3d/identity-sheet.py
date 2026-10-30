# Knowing the bird at range (tools3d/review-identity.mjs): for each species, a
# before row over an after row. At 30 m six consecutive 30 fps frames (the
# wingbeat as a phone shows it), then two frames each at 40 and 55 m. Crops
# round the bird at the screen's own pixels, enlarged with square pixels.
# Usage: python3 tools3d/identity-sheet.py <out.jpg> <label=identity.json> ...
import json, os, sys
from PIL import Image, ImageDraw

out = sys.argv[1]
runs = [(a.split('=', 1)[0], a.split('=', 1)[1]) for a in sys.argv[2:]]
CROP, TILE, LABEL = 40, 120, 118
picks = [(30, k) for k in range(6)] + [(40, 0), (40, 3), (55, 0), (55, 3)]

reports = [(label, json.load(open(path)), os.path.dirname(path)) for label, path in runs]
species = []
for _, report, _ in reports:
    for bird in report['birds']:
        if bird['species'] not in species:
            species.append(bird['species'])
rows = []
for sp in species:
    for label, report, root in reports:
        bird = next((b for b in report['birds'] if b['species'] == sp), None)
        if not bird:
            continue
        row = Image.new('RGB', (LABEL + TILE * len(picks), TILE + 14), (18, 18, 18))
        d = ImageDraw.Draw(row)
        d.text((4, 4), f"{sp}", fill=(240, 236, 214))
        d.text((4, 18), f"{label}", fill=(200, 200, 186))
        for c, (rng, k) in enumerate(picks):
            shot = next((s for s in bird['shots'] if s['range'] == rng and s['frame'] == k), None)
            if not shot or 'screen' not in shot:
                continue
            im = Image.open(os.path.join(root, shot['file'])).convert('RGB')
            x, y = shot['screen']['x'], shot['screen']['y']
            piece = im.crop((x - CROP // 2, y - CROP // 2, x + CROP // 2, y + CROP // 2)).resize((TILE, TILE), Image.NEAREST)
            row.paste(piece, (LABEL + c * TILE, 14))
            tag = f"{rng} m" + (f" +{k}" if k else f" {shot['spanPx']:.0f}px")
            d.text((LABEL + c * TILE + 3, 1), tag, fill=(255, 240, 160))
        rows.append(row)
sheet = Image.new('RGB', (max(r.width for r in rows), 22 + sum(r.height + 3 for r in rows)), (10, 10, 10))
ImageDraw.Draw(sheet).text((6, 5), 'Knowing the bird on a phone (844x390, Lightweight): at 30 m six frames in a row at 30 fps (the wingbeat), then 40 and 55 m; crops at screen pixels, enlarged 3x', fill=(255, 255, 255))
y = 22
for r in rows:
    sheet.paste(r, (0, y)); y += r.height + 3
sheet.save(out, quality=82)
print(out, sheet.size, f'{os.path.getsize(out) // 1024} KB')
