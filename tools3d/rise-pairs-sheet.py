# Rise rows side by side: for each run given, one row of its frames at the
# chosen times, marked as rise-sheet.py marks them (cyan ring: against the
# sky; orange: against the land; grey: falling; the number is the bird's
# span in px), captioned with how near any line came to the hunter.
# Usage: python3 tools3d/rise-pairs-sheet.py <out.jpg> <title> <times, e.g. 0.5,1,1.5,2,3> <label=rise.json> ...
import json, os, sys
from PIL import Image, ImageDraw

out, title, times = sys.argv[1], sys.argv[2], [float(t) for t in sys.argv[3].split(',')]
runs = [(arg.split('=', 1)[0], arg.split('=', 1)[1]) for arg in sys.argv[4:]]
TW = 300

rows = []
for label, path in runs:
    report = json.load(open(path))
    root = os.path.dirname(path)
    for rise in report['rises']:
        frames = rise.get('frames') or []
        if not frames:
            continue
        th = round(TW * rise['height'] / rise['width'])
        row = Image.new('RGB', (TW * len(times), th + 34), (22, 24, 24))
        d = ImageDraw.Draw(row)
        f, hunt = rise.get('final') or {}, rise.get('hunt') or {}
        fly = f.get('flyBys') or []
        lines = f.get('lines') or {}
        d.text((4, 2), f"{label}  {rise['area']} {rise['size']}  hunter {hunt.get('hunterAboveCoveyM', '-')} m above the covey ({hunt.get('approach') or 'as he came'})"
               f"  lines {lines}", fill=(236, 232, 214))
        d.text((4, 16), f"closest any line came {f.get('closestPassM', '-')} m (nearest rise {f.get('roseNearestM', '-')} m)  fly-bys inside 9 m: "
               + (', '.join(f"{b['roseAtM']}->{b['nearestM']} m" for b in fly) if fly else 'none'), fill=(255, 220, 150) if fly else (200, 200, 186))
        k = TW / rise['width']
        for c, t in enumerate(times):
            fr = min(frames, key=lambda x: abs(x['t'] - t))
            p = os.path.join(root, fr['file'])
            if not os.path.exists(p):
                continue
            x0, y0 = c * TW, 34
            row.paste(Image.open(p).convert('RGB').resize((TW, th), Image.LANCZOS), (x0, y0))
            d.text((x0 + 3, y0 + 2), f"t {fr['t']:.2f} s", fill=(255, 240, 160))
            for b in fr.get('birds', []):
                s = b.get('screen')
                if not s or not s.get('onScreen'):
                    continue
                cx, cy = x0 + s['x'] * k, y0 + s['y'] * k
                r = max(4, b['spanPx'] * k * .8)
                color = (150, 150, 150) if b['status'] == 'falling' else (60, 220, 240) if b['sky'] else (255, 150, 40)
                d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=2)
                d.text((cx + r + 2, cy - 6), f"{b['spanPx']:.0f}", fill=color)
        rows.append(row)

sheet = Image.new('RGB', (max(r.width for r in rows), 24 + sum(r.height + 4 for r in rows)), (12, 12, 12))
ImageDraw.Draw(sheet).text((6, 6), title, fill=(255, 255, 255))
y = 24
for r in rows:
    sheet.paste(r, (0, y)); y += r.height + 4
sheet.save(out, quality=76)
print(out, sheet.size, f'{os.path.getsize(out) // 1024} KB')
