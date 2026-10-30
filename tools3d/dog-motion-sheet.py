# Contact strips from tools3d/dog-motion-bench.mjs videos: consecutive frames
# of one view row, one crop per breed panel, with optional before/after rows.
#
#   python3 tools3d/dog-motion-sheet.py <out.jpg> --video before=/tmp/a/video/paces.mp4 \
#     --video after=/tmp/b/video/paces.mp4 --row side --start 19.0 --count 10 --step 1 \
#     --breeds gsp,english-setter,griffon --crop 300x170 --scale 1 --title "Gallop, 5.5 m/s"
#
# Rows of the bench frame are side (360 px), eye and look (each panel width x
# 9/16); --rows lists them in the order the bench rendered them. Crops follow
# the dog: each is centred on the darkest-and-lightest pixels that differ
# from the panel's ground, so a moving dog stays in frame.
import argparse, os, subprocess, tempfile
from PIL import Image, ImageChops, ImageDraw, ImageFilter

p = argparse.ArgumentParser()
p.add_argument('out')
p.add_argument('--video', action='append', required=True, help='label=path, one per strip row group')
p.add_argument('--row', default='side')
p.add_argument('--rows', default='side,eye,look')
p.add_argument('--panel', default='640x360')
p.add_argument('--start', type=float, required=True)
p.add_argument('--count', type=int, default=10)
p.add_argument('--step', type=int, default=1, help='frames between samples (30 fps)')
p.add_argument('--fps', type=float, default=30)
p.add_argument('--breeds', default='gsp,english-setter,griffon')
p.add_argument('--only', default=None, help='comma list of breeds to include')
p.add_argument('--crop', default='300x170')
p.add_argument('--scale', type=float, default=1)
p.add_argument('--title', default='')
p.add_argument('--quality', type=int, default=82)
p.add_argument('--track', action='store_true', help='re-centre the crop on the dog every frame')
a = p.parse_args()
pw, ph = map(int, a.panel.split('x'))
cw, ch = map(int, a.crop.split('x'))
breeds = a.breeds.split(',')
keep = a.only.split(',') if a.only else breeds
rows = a.rows.split(',')
heights = [ph if r == 'side' else round(pw * 9 / 16) for r in rows]
top = sum(heights[:rows.index(a.row)]); rh = heights[rows.index(a.row)]
NAMES = {'gsp': 'GSP', 'english-setter': 'Setter', 'griffon': 'Griffon'}

def frames(path):
    tmp = tempfile.mkdtemp()
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', f'{a.start:.3f}', '-i', path,
                    '-frames:v', str(a.count * a.step), os.path.join(tmp, '%04d.png')], check=True)
    files = sorted(os.listdir(tmp))[::a.step][:a.count]
    return [Image.open(os.path.join(tmp, f)).convert('RGB') for f in files]

def dog_centre(panel):
    # The dog is what differs from a blurred copy of its own panel.
    blur = panel.filter(ImageFilter.BoxBlur(18))
    mask = ImageChops.difference(panel, blur).convert('L').point(lambda v: 255 if v > 28 else 0)
    mask = mask.filter(ImageFilter.MinFilter(3))
    box = mask.getbbox()
    return ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2) if box else (panel.width // 2, panel.height // 2)

groups = []
for spec in a.video:
    label, path = spec.split('=', 1)
    groups.append((label, frames(path)))
sw, sh = int(cw * a.scale), int(ch * a.scale)
head = 26 if a.title else 0
lines = [(b, label, fr) for b in breeds if b in keep for label, fr in groups]
sheet = Image.new('RGB', (110 + a.count * sw, head + len(lines) * sh), (28, 30, 30))
d = ImageDraw.Draw(sheet)
if a.title: d.text((8, 7), a.title, fill=(235, 235, 230))
centres = {}
for li, (breed, label, fr) in enumerate(lines):
    col = breeds.index(breed)
    d.text((8, head + li * sh + sh // 2 - 12), NAMES.get(breed, breed), fill=(235, 235, 230))
    d.text((8, head + li * sh + sh // 2 + 2), label, fill=(170, 200, 255) if label == 'after' else (230, 190, 150))
    for i, frame in enumerate(fr):
        panel = frame.crop((col * pw, top, (col + 1) * pw, top + rh))
        # One crop centre per breed row, taken from the first frame, so the
        # strip shows the dog moving through a fixed window like a film.
        key = (breed, label)
        if key not in centres or a.track: centres[key] = dog_centre(panel)
        cx, cy = centres[key]
        crop = panel.crop((cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2))
        if a.scale != 1: crop = crop.resize((sw, sh), Image.NEAREST if a.scale > 1 else Image.LANCZOS)
        sheet.paste(crop, (110 + i * sw, head + li * sh))
    d.line((0, head + li * sh, sheet.width, head + li * sh), fill=(60, 60, 60))
sheet.save(a.out, quality=a.quality)
print(a.out, sheet.size, os.path.getsize(a.out) // 1024, 'KB')
