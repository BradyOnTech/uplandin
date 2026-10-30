# Levels of the field's sound in a recording: tools3d/field-sound-review.mjs
# reports (phases: the bed, the hush on a point, the rise, a report) or
# tools3d/playthrough.mjs --audio manifests (its checkpoints). Per phase:
# the floor (10th percentile of 100 ms windows: the bed between calls and
# bells), the median, the 95th percentile, the peak, samples at full scale,
# and how the bed's energy splits low, mid and high. Encoded destination
# mix, measured, not listened to.
# Usage: python3 tools3d/field-sound-levels.py <report.json> [...]
import sys, os, json, subprocess
import numpy as np

RATE = 48000
WINDOW = int(RATE * .1)
BANDS = [('low', 80, 500), ('mid', 500, 2000), ('high', 2000, 8000)]

def decode(path):
    raw = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path, '-vn', '-ac', '2', '-ar', str(RATE), '-f', 'f32le', 'pipe:1'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)

def db(x): return 20 * np.log10(max(float(x), 1e-9))

def bands(a):
    if len(a) < RATE // 2: return ''
    mono = a.mean(axis=1)
    spectrum = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    freqs = np.fft.rfftfreq(len(mono), 1 / RATE)
    total = spectrum.sum() or 1
    return '  ' + ' '.join(f"{name} {spectrum[(freqs >= lo) & (freqs < hi)].sum() / total * 100:.0f}%" for name, lo, hi in BANDS)

def stats(audio, name, s, e, with_bands):
    a = audio[max(0, int(s * RATE)):max(0, int(e * RATE))]
    n = len(a) // WINDOW
    if n == 0: return None
    w = np.sqrt((a[:n * WINDOW].reshape(n, WINDOW, 2) ** 2).mean(axis=(1, 2)))
    row = {'phase': name, 'floor': db(np.percentile(w, 10)), 'median': db(np.median(w)), 'p95': db(np.percentile(w, 95)),
           'peak': db(np.abs(a).max()), 'fullScale': int((np.abs(a) >= .999).sum())}
    print(f"  {name:16s} floor {row['floor']:6.1f}  median {row['median']:6.1f}  P95 {row['p95']:6.1f}  peak {row['peak']:6.1f} dBFS"
          f"  full-scale {row['fullScale']}" + (bands(a) if with_bands else ''))
    return row

for path in sys.argv[1:]:
    r = json.load(open(path))
    rows = []
    if 'phases' in r:
        audio = decode(r['audio'])
        rec = r['recordings'][-1]
        offset = (r['t0EpochMs'] - rec['startedEpochMs']) / 1000
        print(f"\n{r['area']} {r['quality']} {r['tod']} {r['query']}: {len(audio) / RATE:.0f} s, point {'yes' if r.get('pointed') else 'no'}")
        merged = []
        for p in r['phases']:
            if merged and merged[-1]['id'] == p['id'] and abs(merged[-1]['to'] - p['from']) < .5: merged[-1]['to'] = p['to']
            else: merged.append(dict(p))
        for p in merged:
            row = stats(audio, p['id'], p['from'] + offset, p['to'] + offset, p['id'] in ('field', 'hunting', 'point at 35 m', 'point at 10 m'))
            if row: rows.append(row)
        analyser = max((s['peak'] for s in r.get('peaks', [])), default=0)
        print(f"  analyser peak before encoding {db(analyser):.1f} dBFS")
    else:
        video = r.get('video') or ''
        if not os.path.isabs(video): video = os.path.join(os.path.dirname(path), os.path.basename(video))
        audio = decode(video)
        at = {c['event']: c.get('approximateVideoSeconds') for c in r['checkpoints'] if c.get('approximateVideoSeconds') is not None}
        print(f"\n{r['options']['area']} {r['options']['quality']} {r['options'].get('query')}: {r['result']}")
        point, rise, miss = at.get('point'), at.get('covey-rise'), at.get('deliberate-miss')
        if point: rows.append(stats(audio, 'working', max(1.0, point - 25), point, True))
        if point and rise: rows.append(stats(audio, 'walk-in', max(point, rise - 4), rise, True))
        if rise: rows.append(stats(audio, 'the rise', rise, rise + 2.5, False))
        if miss: rows.append(stats(audio, 'the report', miss - .05, miss + .6, False))
    json.dump([x for x in rows if x], open(path.replace('.json', '-levels.json'), 'w'), indent=1)
