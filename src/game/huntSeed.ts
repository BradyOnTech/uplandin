/** Explicit seeds reproduce a hunt; a new visit receives a fresh seed at boot. */
export const REVIEW_HUNT_SEED = 0x51ba11;

export function parseHuntSeed(search: string): number | undefined {
  const value = new URLSearchParams(search).get('seed');
  if (value === null || !/^\d{1,10}$/.test(value)) return undefined;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed <= 0xffffffff ? seed : undefined;
}

export function randomHuntSeed(): number {
  return globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 0x100000000);
}

/** Stable independent streams prevent population changes from rerolling wind. */
export function huntStreamSeed(seed: number, stream: number): number {
  let value = (seed ^ stream) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function prepareHuntUrl(href: string, freshSeed: () => number = randomHuntSeed): URL {
  const url = new URL(href);
  if (parseHuntSeed(url.search) === undefined) {
    url.searchParams.set('seed', String(url.searchParams.has('capture') ? REVIEW_HUNT_SEED : freshSeed() >>> 0));
  }
  return url;
}

export function nextHuntUrl(href: string): URL {
  const url = new URL(href);
  url.searchParams.delete('seed');
  return url;
}
