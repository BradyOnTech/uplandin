# Levels of the field's sound in recorded playthroughs (tools3d/playthrough.mjs
# --audio): the bed while the dog works, the hush on the walk-in to a point,
# the covey's wings and the report, and any sample at full scale. Encoded
# destination mix, measured, not listened to.
# Usage: python3 tools3d/field-sound-levels.py <manifest.json> [...]
import sys, os, json, subprocess
import numpy as np

RATE = 48000
WINDOW = int(RATE * .1)
BANDS = [('low 80-500 Hz', 80, 500), ('mid 500-2k', 500, 2000), ('high 2-8k', 2000, 8000)]

def decode(video):
    raw = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', video, '-vn', '-ac', '2', '-ar', str(RATE), '-f', 'f32le', 'pipe:1'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)

def db(x): return 20 * np.log10(max(float(x), 1e-9))

def windows(audio, start, end):
    a = audio[max(0, int(start * RATE)):max(0, int(end * RATE))]
    n = len(a) // WINDOW
    if n == 0: return None, a
    w = a[:n * WINDOW].reshape(n, WINDOW, 2)
    return np.sqrt((w ** 2).mean(axis=(1, 2))), a

def bands(a):
    if len(a) < RATE // 2: return {}
    mono = a.mean(axis=1)
    spectrum = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    freqs = np.fft.rfftfreq(len(mono), 1 / RATE)
    total = spectrum.sum() or 1
    return {name: float(spectrum[(freqs >= lo) & (freqs < hi)].sum() / total) for name, lo, hi in BANDS}

for path in sys.argv[1:]:
    m = json.load(open(path))
    video = m.get('video') or ''
    if not os.path.isabs(video): video = os.path.join(os.path.dirname(path), os.path.basename(video))
    audio = decode(video)
    at = {c['event']: c.get('approximateVideoSeconds') for c in m['checkpoints'] if c.get('approximateVideoSeconds') is not None}
    q = dict(kv.split('=') for kv in (m['options'].get('query') or '').split('&') if '=' in kv)
    print(f"\n{m['options']['area']} {m['options']['quality']} {m['options']['tod']} {q} - {m['result']}; {len(audio) / RATE:.0f} s recorded")
    point, rise, miss = at.get('point'), at.get('covey-rise'), at.get('deliberate-miss')
    segments = []
    if point: segments.append(('working (to the point)', max(1.0, point - 25), point))
    if point and rise: segments.append(('walk-in (last 4 s before the rise)', max(point, rise - 4), rise))
    if rise: segments.append(('the rise (2.5 s)', rise, rise + 2.5))
    if miss: segments.append(('the report (0.6 s)', miss - .05, miss + .6))
    segments.append(('whole hunt', 0, len(audio) / RATE))
    for name, s, e in segments:
        w, a = windows(audio, s, e)
        if w is None: continue
        full = int((np.abs(a) >= .999).sum())
        b = bands(a) if name.startswith(('working', 'walk-in')) else {}
        print(f"  {name:36s} floor (P10) {db(np.percentile(w, 10)):6.1f}  median {db(np.median(w)):6.1f}  P95 {db(np.percentile(w, 95)):6.1f}  peak {db(np.abs(a).max()):6.1f} dBFS"
              f"  full-scale samples {full}" + ('  ' + '  '.join(f'{k} {v * 100:.0f}%' for k, v in b.items()) if b else ''))
