// One recycled hunt-lab worker: runs configs [start, end) and exits, so no
// process keeps a Vite SSR server alive for more than one chunk.
//   node tools3d/huntlab/worker.mjs <configs.json> <start> <end> <out.jsonl>
import { runHunt, close } from './harness.mjs';
import fs from 'node:fs';

const [file, start, end, out] = process.argv.slice(2);
const configs = JSON.parse(fs.readFileSync(file, 'utf8')).slice(Number(start), Number(end));
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).includes('budget')) warn(...a); };
for (const c of configs) {
  const t0 = Date.now();
  let r;
  try { r = await runHunt(c); }
  catch (e) { r = { ...c, error: String(e?.stack ?? e).slice(0, 600) }; }
  r.wallS = (Date.now() - t0) / 1000;
  fs.appendFileSync(out, JSON.stringify(r) + '\n');
}
await close();
