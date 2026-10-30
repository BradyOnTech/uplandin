# Season and weather sheets for one ground from tools3d/weather-review.mjs
# reports: the month strip, the weather strip, and readability crops of the
# pointing dog at 30 yd and the first birds in the air, each day measured
# against its own frame without the subject (visible pixels, and the mean
# Rec.709 luminance step they make against what is behind them).
# Usage: python3 tools3d/weather-sheet.py <root> <area> <before> <after> <outdir> [cell width]
#   reads <root>/<label>/<area>/*.json
import sys, os, glob, json
import numpy as np
from PIL import Image, ImageDraw

root, area, before, after, outdir = sys.argv[1:6]
W = int(sys.argv[6]) if len(sys.argv) > 6 else 360
MAX_KB = 400
MONTHS = ['sep', 'oct', 'nov', 'dec', 'jan']
WEATHERS = ['clear', 'rain', 'frost', 'snow', 'wind']

def reports(label):
    out = []
    for path in sorted(glob.glob(f'{root}/{label}/{area}/*.json')):
        r = json.load(open(path)); r['dir'] = os.path.dirname(path); out.append(r)
    return out

def rgb(r, f): return np.asarray(Image.open(os.path.join(r['dir'], f)).convert('RGB'), dtype=np.float32) / 255

def lum(a): return a[..., 0] * .2126 + a[..., 1] * .7152 + a[..., 2] * .0722

def subject(r, f, without):
    """Visible subject pixels (where the frame differs from the frame without
    it), their luminance step against the background, and their box."""
    a, b = rgb(r, f), rgb(r, without)
    mask = np.abs(a - b).max(axis=2) > 18 / 255
    n = int(mask.sum())
    if not n: return {'px': 0, 'step': 0.0, 'box': None}
    step = float(np.abs(lum(a) - lum(b))[mask].mean())
    ys, xs = np.nonzero(mask)
    return {'px': n, 'step': step, 'box': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]}

def save(sheet, path):
    for q in (84, 78, 72, 66, 60, 54):
        sheet.save(path, quality=q, optimize=True)
        if os.path.getsize(path) <= MAX_KB * 1024: break
    print(path, sheet.size, os.path.getsize(path) // 1024, 'KB')

def grid(rows, cols, cell_w, cell_h, title):
    head = 22
    sheet = Image.new('RGB', (cols * cell_w + 150, head + len(rows) * (cell_h + 16)), (22, 22, 22))
    d = ImageDraw.Draw(sheet)
    d.text((6, 4), title, fill=(240, 240, 240))
    return sheet, d, head

def strips(base, aft, strip, days, name):
    rows = []
    for q in ('high', 'lite'):
        b = next((r for r in base if r['quality'] == q and any(f['part'] == 'strip' for f in r['frames'])), None)
        a = next((r for r in aft if r['quality'] == q and any(f['part'] == 'strip' for f in r['frames'])), None)
        if not a: continue
        for view in dict.fromkeys(f['view'] for f in a['frames'] if f['part'] == 'strip'):
            cells = [(b, next((f for f in b['frames'] if f['part'] == 'strip' and f['view'] == view), None), 'before') if b else (None, None, 'before')]
            for day in days:
                cells.append((a, next((f for f in a['frames'] if f.get('strip') == strip and f['view'] == view and f['day'] == day), None), day))
            rows.append((f'{q} {view}', cells))
    if not rows: return
    H = W * 9 // 16
    sheet, d, head = grid(rows, 1 + len(days), W, H, f'{area}: {strip} strip, before (campaign head) then {", ".join(days)}; morning, seed 7701')
    for i, (label, cells) in enumerate(rows):
        y = head + i * (H + 16)
        d.text((6, y + 2 + H // 2), label, fill=(235, 235, 235))
        for c, (r, f, day) in enumerate(cells):
            x = 150 + c * W
            d.text((x + 4, y + 2), day, fill=(235, 235, 235))
            if r and f: sheet.paste(Image.open(os.path.join(r['dir'], f['file'])).convert('RGB').resize((W, H), Image.LANCZOS), (x, y + 16))
    save(sheet, os.path.join(outdir, f'{area}-m3-{name}.jpg'))

def readability(base, aft):
    rows, metrics = [], []
    for q in ('high', 'lite'):
        for a in [r for r in aft if r['quality'] == q and any(f['part'] in ('dog', 'birds') for f in r['frames'])]:
            size = f"{a['width']}x{a['height']}"
            b = next((r for r in base if r['quality'] == q and f"{r['width']}x{r['height']}" == size and any(f['part'] in ('dog', 'birds') for f in r['frames'])), None)
            for part, t in [('dog', None)] + [('birds', t) for t in sorted({f['t'] for f in a['frames'] if f['part'] == 'birds'})]:
                pick = lambda r, day: next((f for f in r['frames'] if f['part'] == part and f.get('t') == t and f['day'] == day), None) if r else None
                cells = [(b, pick(b, 'base'), 'before')] + [(a, pick(a, day), day) for day in WEATHERS]
                measured = []
                for r, f, day in cells:
                    m = subject(r, f['file'], f['without']) if r and f and f.get('without') else None
                    measured.append(m)
                    if m: metrics.append({'quality': q, 'size': size, 'part': part if t is None else f'birds t{t}', 'day': day, **{k: v for k, v in m.items() if k != 'box'}})
                # One crop window per row, from the clear day's subject.
                ref = next((m for m, (r, f, day) in zip(measured, cells) if m and m['box'] and day == 'clear'), None) or next((m for m in measured if m and m['box']), None)
                if ref:
                    x0, y0, x1, y1 = ref['box']
                    cx, cy, half = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, (y1 - y0) * 16 / 9, 96) * .9
                    box = (int(cx - half), int(cy - half * 9 / 16), int(cx + half), int(cy + half * 9 / 16))
                else:
                    f0 = next((f for r, f, day in cells if f), None)
                    pts = [bd['px'] for bd in (f0 or {}).get('birds', []) if bd.get('px')]
                    if pts:
                        xs, ys = [p['x'] for p in pts], [p['y'] for p in pts]
                        cx, cy, half = sum(xs) / len(xs), sum(ys) / len(ys), max(max(xs) - min(xs), 160) * .8
                        box = (int(cx - half), int(cy - half * 9 / 16), int(cx + half), int(cy + half * 9 / 16))
                    else: box = None
                label = f"{q} {size} {part if t is None else f'birds {t}s'}"
                if part == 'dog':
                    rng = next((f.get('rangeM') for r, f, day in cells if f and f.get('rangeM')), None)
                    if rng: label += f' {rng / .9144:.0f} yd'
                else:
                    f0 = next((f for r, f, day in cells if f and day == 'clear'), None)
                    if f0: label += f" {len(f0['birds'])} up " + '/'.join(f"{bd['rangeM']:.0f}" for bd in f0['birds'][:4]) + ' m'
                rows.append((label, cells, measured, box))
    if not rows: return metrics
    H = W * 9 // 16
    sheet, d, head = grid(rows, 6, W, H, f'{area}: the pointing dog from 30 yd and the first birds up, the same moment each day (crops; px = visible subject pixels, step = mean luminance step)')
    for i, (label, cells, measured, box) in enumerate(rows):
        y = head + i * (H + 16)
        for k, line in enumerate(label.split(' ', 3)): d.text((6, y + 20 + k * 14), line, fill=(235, 235, 235))
        for c, ((r, f, day), m) in enumerate(zip(cells, measured)):
            x = 150 + c * W
            d.text((x + 4, y + 2), day + (f"  {m['px']} px  step {m['step']:.3f}" if m else ''), fill=(235, 235, 235))
            if not (r and f): continue
            img = Image.open(os.path.join(r['dir'], f['file'])).convert('RGB')
            sheet.paste((img.crop(box) if box else img).resize((W, H), Image.LANCZOS), (x, y + 16))
    save(sheet, os.path.join(outdir, f'{area}-m3-readability.jpg'))
    return metrics

os.makedirs(outdir, exist_ok=True)
base, aft = reports(before), reports(after)
strips(base, aft, 'month', MONTHS, 'months')
strips(base, aft, 'weather', WEATHERS, 'weather')
metrics = readability(base, aft)
for m in metrics: print(f"{m['quality']:4s} {m['size']:8s} {m['part']:10s} {m['day']:6s} {m['px']:6d} px  step {m['step']:.3f}")
for r in aft + base:
    for c in r.get('cost', []): print(f"cost {r['label']:6s} {r['quality']:4s} {c['view']:6s} {c['day']:6s} median {c['median']:.2f} ms  p90 {c['p90']:.2f} ms  {c['calls']} draws  {c['triangles']} tris")
