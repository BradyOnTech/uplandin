// Run a hunt-lab config set with at most two workers, each recycled after a
// chunk of hunts (every worker holds a Vite SSR server; the Mac has 16 GB).
// Always wrap it in tools3d/heavy.sh:
//   tools3d/heavy.sh node tools3d/huntlab/sweep.mjs <configs.json> <out.jsonl> [--workers 2] [--chunk 30]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const [file, out] = args;
const opt = (key, fallback) => args.includes(key) ? Number(args[args.indexOf(key) + 1]) : fallback;
const workers = Math.max(1, Math.min(2, opt('--workers', 2))), chunk = opt('--chunk', 30);
const total = JSON.parse(fs.readFileSync(file, 'utf8')).length;
const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));
fs.writeFileSync(out, '');
const chunks = [];
for (let start = 0; start < total; start += chunk) chunks.push([start, Math.min(total, start + chunk)]);
const t0 = Date.now();
let next = 0, done = 0;
async function lane(i) {
  while (next < chunks.length) {
    const [start, end] = chunks[next++];
    const part = `${out}.part${i}`;
    fs.rmSync(part, { force: true });
    await new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['--max-old-space-size=1200', worker, file, String(start), String(end), part],
        { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
      p.on('exit', code => code === 0 ? resolve() : reject(new Error(`worker ${start}-${end} exit ${code}`)));
    });
    if (fs.existsSync(part)) fs.appendFileSync(out, fs.readFileSync(part, 'utf8'));
    fs.rmSync(part, { force: true });
    done += end - start;
    process.stdout.write(`${done}/${total} hunts, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  }
}
await Promise.all(Array.from({ length: workers }, (_, i) => lane(i)));
console.log(`done ${total} hunts in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${out}`);
