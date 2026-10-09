# Contact sheet for tools3d/cover-review.mjs: rows are grass styles, columns
# are viewing distances, each frame labelled with its draws and triangles.
# Usage: python3 tools3d/cover-sheet.py <report.json> <out.jpg> [frame width]
import sys, os, json
from PIL import Image, ImageDraw
report_path, out = sys.argv[1], sys.argv[2]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 480
H = W * 9 // 16
report = json.load(open(report_path))
root = os.path.dirname(report_path)
styles, distances = [], []
for f in report['frames']:
    if f['style'] not in styles: styles.append(f['style'])
    if f['d'] not in distances: distances.append(f['d'])
sheet = Image.new('RGB', (len(distances) * W, len(styles) * (H + 18)), (24, 24, 24))
d = ImageDraw.Draw(sheet)
for f in report['frames']:
    r, c = styles.index(f['style']), distances.index(f['d'])
    im = Image.open(os.path.join(root, f['file'])).convert('RGB').resize((W, H), Image.LANCZOS)
    sheet.paste(im, (c * W, r * (H + 18) + 18))
    render = f['render']
    d.text((c * W + 4, r * (H + 18) + 3), f"{f['style']} {report['quality']} {f['d']} m  {render['calls']} draws  {render['triangles'] / 1000:.0f}k tris", fill=(230, 230, 230))
sheet.save(out, quality=82)
print(out, sheet.size, os.path.getsize(out) // 1024, 'KB')
