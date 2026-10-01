import { AREAS, isOfferedArea, type AreaConfig } from './areas';

/**
 * The continental-US travel map: seven regions, each holding its areas.
 * Regions without built species yet show as "coming" on the map. Travel
 * gating (the truck) arrives with hunter progression; for now every built
 * region is open.
 */
export interface RegionConfig {
  id: string;
  name: string;
  blurb: string;
  /** Marker position on the 480×270 travel map. */
  map: { x: number; y: number };
  areaIds: string[];
  built: boolean;
}

export const REGIONS: RegionConfig[] = [
  {
    id: 'southern-plains',
    name: 'Southern Plains',
    blurb: 'bobwhite country — home ground',
    map: { x: 255, y: 185 },
    areaIds: ['quail-fields'],
    built: true,
  },
  {
    id: 'prairie-pothole',
    name: 'Prairie Pothole',
    blurb: 'roosters, sharptails, chickens, and Huns',
    map: { x: 252, y: 85 },
    areaIds: ['pheasant-coverts', 'sharptail-prairie'],
    built: true,
  },
  {
    id: 'north-woods',
    name: 'North Woods',
    blurb: 'ruffed grouse and woodcock',
    map: { x: 332, y: 64 },
    areaIds: ['grouse-woods', 'woodcock-bottoms'],
    built: true,
  },
  {
    id: 'great-basin',
    name: 'Great Basin',
    blurb: 'Huns and chukar on the rimrock',
    map: { x: 112, y: 118 },
    areaIds: ['hun-benches', 'chukar-ridge'],
    built: true,
  },
  {
    id: 'sonoran-desert',
    name: 'Sonoran Desert',
    blurb: "Gambel's, scalies, and Montezuma quail",
    map: { x: 135, y: 172 },
    areaIds: ['desert-washes', 'mearns-canyons'],
    built: true,
  },
  {
    id: 'high-rockies',
    name: 'High Rockies',
    blurb: 'blue grouse and mountain quail up high',
    map: { x: 160, y: 94 },
    areaIds: ['timberline-parks'],
    built: true,
  },
  {
    id: 'pacific-valleys',
    name: 'Pacific Valleys',
    blurb: 'California quail under the oaks',
    map: { x: 60, y: 88 },
    areaIds: ['valley-oaks'],
    built: true,
  },
];

/** Regions holding an offered ground, each listing only its offered grounds.
 * Career home choice and travel use these; REGIONS keeps the full map. */
export const OFFERED_REGIONS: readonly RegionConfig[] = REGIONS
  .filter((region) => region.built && region.areaIds.some(isOfferedArea))
  .map((region) => ({ ...region, areaIds: region.areaIds.filter(isOfferedArea) }));

export function offeredRegion(id: string | null | undefined): RegionConfig | undefined {
  return OFFERED_REGIONS.find((region) => region.id === id);
}

export function getRegion(id: string): RegionConfig {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}

export function regionAreas(region: RegionConfig): AreaConfig[] {
  return region.areaIds
    .map((id) => AREAS.find((a) => a.id === id))
    .filter((a): a is AreaConfig => a !== undefined);
}

/** The region an area belongs to (for records and travel-back). */
export function regionOfArea(areaId: string): RegionConfig {
  return REGIONS.find((r) => r.areaIds.includes(areaId)) ?? REGIONS[0];
}
