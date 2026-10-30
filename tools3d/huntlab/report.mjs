// Pacing table from hunt-lab results.
//   node tools3d/huntlab/report.mjs <results.jsonl> [groupKeys=area,hunter] [--md]
// Columns: first contact / first point (median s), longest dry spell (median
// and p90 s), hunts with a dry spell over 3 min, coveys met, points and
// flushes per hunt, shots / hits / delivered, median retrieve s, stuck
// retrieves, stuck dog states, birds or falls inside solid rock, climb m.
import fs from 'node:fs';

const [file, keyArg = 'area,hunter', ...flags] = process.argv.slice(2);
const md = flags.includes('--md');
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const errors = rows.filter(r => r.error);
if (errors.length) console.error(`${errors.length} errors, first: ${errors[0].error.slice(0, 300)}`);
const ok = rows.filter(r => !r.error);
const keys = keyArg.split(',');
const groups = new Map();
for (const r of ok) {
  const k = keys.map(key => key === 'dog' ? `${r.breed}-${r.level}` : r[key]).join(' ');
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + .5))] : NaN; };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const sum = xs => xs.reduce((a, b) => a + b, 0);
const cols = ['group', 'n', '1st contact', '1st point', 'dry med', 'dry p90', 'dry>3m', 'coveys', 'points', 'flushes',
  'shots', 'hits', 'delivered', 'retrieve s', 'stuck retr', 'stuck states', 'long chases', 'in rock', 'climb m'];
// A dog roading a runner for over 75 s is a long chase, not a stuck dog.
const stuckOf = r => r.stuckStates.filter(s => s.state !== 'tracking').length, chasesOf = r => r.stuckStates.filter(s => s.state === 'tracking').length;
const table = [];
for (const [k, g] of [...groups].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
  const T = g[0].seconds;
  const flushes = g.map(r => Object.values(r.flushCauses ?? {}).reduce((a, b) => a + b, 0));
  table.push([k, g.length,
    q(g.map(r => r.firstContactS ?? T), .5).toFixed(0), q(g.map(r => r.firstPointS ?? T), .5).toFixed(0),
    q(g.map(r => r.longestDryS), .5).toFixed(0), q(g.map(r => r.longestDryS), .9).toFixed(0),
    `${Math.round(100 * g.filter(r => r.longestDryS > 180).length / g.length)}%`,
    mean(g.map(r => r.coveysContacted)).toFixed(1), mean(g.map(r => r.points)).toFixed(1), mean(flushes).toFixed(1),
    sum(g.map(r => r.shots)), sum(g.map(r => r.hits)), sum(g.map(r => r.retrieved)),
    q(g.flatMap(r => r.retrieveS), .5).toFixed(0), sum(g.map(r => r.stuckRetrieves)), sum(g.map(stuckOf)), sum(g.map(chasesOf)),
    sum(g.map(r => (r.birdsInSolid ?? 0) + (r.fallsInSolid ?? 0))), mean(g.map(r => r.climbM)).toFixed(0)]);
}
if (md) {
  console.log(`| ${cols.join(' | ')} |`);
  console.log(`|${cols.map(() => ' --- ').join('|')}|`);
  for (const row of table) console.log(`| ${row.join(' | ')} |`);
} else {
  const widths = cols.map((c, i) => Math.max(c.length, ...table.map(r => String(r[i]).length)));
  const line = r => r.map((v, i) => String(v).padStart(widths[i])).join('  ');
  console.log(line(cols));
  for (const row of table) console.log(line(row));
}
const stuck = ok.flatMap(r => r.stuckStates.map(s => `${r.area} ${r.drop} ${r.seed} ${r.breed}-${r.level} ${r.hunter}: ${s.state} ${s.s}s @${s.at}`));
if (stuck.length) console.log(`\nstuck states (${stuck.length}):\n${stuck.slice(0, 30).join('\n')}`);
