# Falls from the hunter's eye, close up: one sheet per ground from
# tools3d/review-rise.mjs --shoot-at runs, a before block over an after block.
# Each row is one hit (the shooter takes them at about 15, 30 and 45 m); its
# crops are centred on the shot bird just after the hit (+0.07, +0.17,
# +0.3 s), where it strikes, and 0.1 s later, at the screen's own pixels
# (a phone crop is enlarged with square pixels, never smoothed).
# Usage: python3 tools3d/falls-sheet.py <out-dir> <label=rise.json> [<label=rise.json> ...]
import json, os, sys
from PIL import Image, ImageDraw

out_dir = sys.argv[1]
runs = [(arg.split('=', 1)[0], arg.split('=', 1)[1]) for arg in sys.argv[2:]]
PHASES = ['+0.07 s', '+0.17 s', '+0.3 s', 'strike', 'strike +0.1 s']
CELL = 200

def crop(frame_path, centre, frame_h):
    im = Image.open(frame_path).convert('RGB')
    side = max(60, round(frame_h * .3))
    cx, cy = centre
    box = (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))
    piece = im.crop(box)
    return piece.resize((CELL, CELL), Image.NEAREST if side < CELL else Image.LANCZOS)

def screen_of(frame, sim_id):
    for b in frame.get('birds', []):
        if b.get('simId') == sim_id and b.get('screen'):
            return b['screen']['x'], b['screen']['y']
    for s in frame.get('struck', []) or []:
        if s.get('simId') == sim_id and s.get('screen'):
            return s['screen']['x'], s['screen']['y']
    return None

grounds = {}
for label, path in runs:
    report = json.load(open(path))
    root = os.path.dirname(path)
    for rise in report['rises']:
        grounds.setdefault(rise['area'], []).append((label, root, rise))

for area, rises in grounds.items():
    blocks = []
    for label, root, rise in rises:
        falls = (rise.get('final') or {}).get('falls') or []
        frames = [fr for fr in rise.get('frames') or [] if fr.get('fall')]
        if not falls:
            continue
        rows = []
        for fall in falls:
            row = Image.new('RGB', (CELL * len(PHASES), CELL + 30), (20, 22, 22))
            d = ImageDraw.Draw(row)
            strike = f"struck {fall['strikeAfterS']} s later at {fall['strikeRangeM']} m" if fall.get('strikeAfterS') is not None else 'no strike seen'
            surface = f" ({fall['surface']})" if fall.get('surface') else ''
            thump = f"  thump heard {fall['thumpDelayMs']} ms after it lands" if fall.get('thumpDelayMs') is not None else '  (no thump timing in this build)'
            feathers = f"  feathers {fall['featherPx']} px" if fall.get('featherPx') is not None else ''
            d.text((4, 3), f"{label} {rise['size']}  hit at {fall['rangeM']} m{feathers}  {strike}{surface}{thump}", fill=(236, 232, 214))
            last = None
            for c, phase in enumerate(PHASES):
                frame = next((fr for fr in frames if fr['fall'].get('simId') == fall['simId'] and fr['fall'].get('phase') == phase), None)
                if not frame:
                    continue
                centre = screen_of(frame, fall['simId']) or last
                if not centre:
                    continue
                last = centre
                p = os.path.join(root, frame['file'])
                if not os.path.exists(p):
                    continue
                row.paste(crop(p, centre, rise['height']), (c * CELL, 28))
                d.text((c * CELL + 4, 30), phase, fill=(255, 240, 160))
            rows.append(row)
        block = Image.new('RGB', (CELL * len(PHASES), sum(r.height for r in rows)), (20, 22, 22))
        y = 0
        for r in rows:
            block.paste(r, (0, y)); y += r.height
        blocks.append(block)
    if not blocks:
        continue
    sheet = Image.new('RGB', (max(b.width for b in blocks), 24 + sum(b.height + 6 for b in blocks)), (12, 12, 12))
    ImageDraw.Draw(sheet).text((6, 6), f'{area}: falls from the hunter\'s eye, crops around the shot bird (30% of screen height, at screen pixels)', fill=(255, 255, 255))
    y = 24
    for b in blocks:
        sheet.paste(b, (0, y)); y += b.height + 6
    out = os.path.join(out_dir, f'{area}-falls.jpg')
    sheet.save(out, quality=80)
    print(out, sheet.size, f'{os.path.getsize(out) // 1024} KB')
