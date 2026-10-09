# Rise strip sheets from tools3d/review-rise.mjs: one sheet per ground, a block
# of frames per screen size, each frame marked with what the shooter faces.
# Usage: python3 tools3d/rise-sheet.py /tmp/uplandin-rise/<label>/rise-<label>.json
# Markers: cyan ring = bird against the sky, orange ring = against the land,
# grey ring = falling; the number beside a ring is its projected span in px.
import json, os, sys
from PIL import Image, ImageDraw

report = json.load(open(sys.argv[1]))
root = os.path.dirname(sys.argv[1])
label = report['label']
COLS, TW = 5, 480

def caption(rise):
    f = rise.get('final') or {}
    lines = f.get('lines') or {}
    total = sum(lines.values()) or 1
    straight = lines.get('straightaway', 0) / total
    sep = f.get('minSeparationDeg')
    sw = f.get('shotWindow')
    sep_text = (f'{sep:.1f} deg' if sep is not None else '-') + (
        f"  shot window min {sw['minDeg']:.1f} / median {sw['medianDeg']:.1f} deg" if sw else '')
    return (f"{rise['size']}  covey {rise['hunt'].get('coveySize')} / flushed {len(rise['hunt'].get('flushed', []))}"
            f"  in play max {f.get('maxInPlay')}  visible max {f.get('maxVisible')}  min sep {sep_text}"
            f"  sky first 1 s {f.get('skyShareFirstSecond', 0) * 100:.0f}%  straightaway {straight * 100:.0f}%"
            f"  lines {lines}  rise length {f.get('riseLengthS')} s  settled {f.get('riseOverS')} s"
            f"  shots {len(f.get('shots') or [])}  draws {rise.get('render', {}).get('calls')}")

by_area = {}
for rise in report['rises']:
    by_area.setdefault(rise['area'], []).append(rise)

for area, rises in by_area.items():
    blocks = []
    for rise in rises:
        frames = rise.get('frames') or []
        if not frames:
            continue
        th = round(TW * rise['height'] / rise['width'])
        rows = (len(frames) + COLS - 1) // COLS
        block = Image.new('RGB', (COLS * TW, 22 + rows * (th + 16)), (22, 24, 24))
        d = ImageDraw.Draw(block)
        d.text((6, 5), caption(rise), fill=(236, 232, 214))
        k = TW / rise['width']
        for i, fr in enumerate(frames):
            x0, y0 = (i % COLS) * TW, 22 + (i // COLS) * (th + 16)
            path = os.path.join(root, fr['file'])
            if not os.path.exists(path):
                continue
            im = Image.open(path).convert('RGB').resize((TW, th), Image.LANCZOS)
            block.paste(im, (x0, y0 + 16))
            sep = fr.get('minShotDeg', fr.get('minPairDeg'))
            d.text((x0 + 4, y0 + 2), f"t {fr['t']:.2f}s  in play {fr['inPlay']}  on screen {fr.get('onScreen', fr['visible'])}  queued {fr['queued']}"
                   + (f"  sep {sep:.0f}deg" if sep is not None else ''), fill=(220, 220, 200))
            for b in fr.get('birds', []):
                s = b.get('screen')
                if not s or not s.get('onScreen'):
                    continue
                cx, cy = x0 + s['x'] * k, y0 + 16 + s['y'] * k
                r = max(5, b['spanPx'] * k * 0.8)
                color = (150, 150, 150) if b['status'] == 'falling' else (60, 220, 240) if b['sky'] else (255, 150, 40)
                d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=2)
                d.text((cx + r + 2, cy - 6), f"{b['spanPx']:.0f}", fill=color)
        blocks.append(block)
    if not blocks:
        continue
    w = max(b.width for b in blocks)
    sheet = Image.new('RGB', (w, 26 + sum(b.height for b in blocks)), (14, 14, 14))
    ImageDraw.Draw(sheet).text((6, 7), f"{area} rise from the hunter's eye  ({label})", fill=(255, 255, 255))
    y = 26
    for b in blocks:
        sheet.paste(b, (0, y)); y += b.height
    out = os.path.join(root, f'{area}-{label}-rise.jpg')
    sheet.save(out, quality=82)
    print(out, f'{os.path.getsize(out) // 1024} KB')
