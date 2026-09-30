#!/usr/bin/env node
/** Cattail Coverts review frames; see tools3d/review-map.mjs for options. */
if (!process.argv.includes('--area')) process.argv.push('--area', 'pheasant-coverts');
await import('./review-map.mjs');
