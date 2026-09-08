import type { GroundSample } from './landscape';

/**
 * The hunting language of a property. A map is more than its terrain
 * palette: the doctrine tells the simulation what the hunter and dog are
 * trying to do there, and gives the presentation one source of truth for
 * the words and pacing that explain that work.
 */
export type HuntStyle =
  | 'quail'
  | 'pheasant'
  | 'open-covey'
  | 'woods'
  | 'bottoms'
  | 'bench-covey'
  | 'chukar'
  | 'desert-wash'
  | 'canyon'
  | 'alpine-edge'
  | 'oak-savanna';

export type RunnerStyle = 'default' | 'pheasant' | 'chukar' | 'desert';

export interface HuntDoctrine {
  style: HuntStyle;
  region: string;
  /** Short field-card copy: what the hunter should notice first. */
  description: string;
  /** Compact field method shown before and during a hunt. */
  method: string;
  /** One actionable sentence, deliberately free of hidden-bird GPS. */
  tip: string;
  guidance: string;
  /** Dog work tuning. A wider value makes the cast feel intentional. */
  dogRangeMult: number;
  /** Fraction of a cover-work clock spent on the outer edge. */
  dogEdgeBias: number;
  /** How long the dog commits to a cover objective before moving on. */
  coverWorkMult: number;
  /** Search/track travel tempo in this habitat; retrieve pace stays shared. */
  dogPaceMult: number;
  /** How quickly a pointed bird becomes wild when the hunter crowds it. */
  pointNerveMult: number;
  pointRadius: number;
  /** How much noise the hunter makes while sprinting in this habitat. */
  hunterSpookRadius?: number;
  /** Running toward a point is more or less costly by property. */
  sprintNerveMult?: number;
  runnerStyle: RunnerStyle;
  /** Hungarian coveys may settle again after a wild, out-of-range rise. */
  circleBack: boolean;
  /** The visual rise keeps birds in their authored world on every property. */
  spatialEncounter: boolean;
  /** World flight tuning after the initial burst. */
  flight: {
    lateral: number;
    climb: number;
    carry: number;
    wobble: number;
  };
}

const GENERAL: HuntDoctrine = {
  style: 'open-covey',
  region: 'UPLAND COUNTRY',
  description: 'Mixed upland cover with a dog working the wind.',
  method: 'WIND SCENT · OPEN CAST',
  tip: 'Work the edges into the wind. When your dog holds point, walk in steadily.',
  guidance: 'Work the cover edges with your dog.',
  dogRangeMult: 1,
  dogEdgeBias: 0,
  coverWorkMult: 1,
  dogPaceMult: 1,
  pointNerveMult: 1,
  pointRadius: 22,
  hunterSpookRadius: 30,
  sprintNerveMult: 1.6,
  runnerStyle: 'default',
  circleBack: false,
  spatialEncounter: true,
  flight: { lateral: 1, climb: 1, carry: 1, wobble: 1 },
};

const DOCTRINES: Record<string, HuntDoctrine> = {
  'quail-fields': {
    style: 'quail', region: 'SOUTHERN PLAINS',
    description: 'Golden grass, plum thickets, and bobwhite country. Give your dog room to find the scent.',
    method: 'COVEY EDGE · HOLD AND WALK IN',
    tip: 'Follow the dog along the plum edges. Let the covey gather before you step into the rise.',
    guidance: 'Follow your dog along the plum edges.', dogRangeMult: 1.04, dogEdgeBias: 0.04, coverWorkMult: 1.14, dogPaceMult: 1,
    pointNerveMult: 1, pointRadius: 22, hunterSpookRadius: 28, sprintNerveMult: 1.55, runnerStyle: 'default', circleBack: false, spatialEncounter: true,
    flight: { lateral: .88, climb: 1.08, carry: .92, wobble: 1.1 },
  },
  'pheasant-coverts': {
    style: 'pheasant', region: 'PRAIRIE POTHOLE',
    description: 'Cattails, cut grain, and running roosters. Keep the dog on the edge and close the next line.',
    method: 'COVER EDGE · READ AND RELOCATE',
    tip: 'Keep a steady pace along the cover edge. If the rooster runs, cut ahead and let the dog relocate it.',
    guidance: 'Read the runner. Cut the next hedge and let your dog close the edge.', dogRangeMult: .88, dogEdgeBias: .2, coverWorkMult: .74, dogPaceMult: 1.15,
    pointNerveMult: .84, pointRadius: 16, hunterSpookRadius: 38, sprintNerveMult: 2.05, runnerStyle: 'pheasant', circleBack: false, spatialEncounter: true,
    flight: { lateral: .7, climb: .78, carry: 1.08, wobble: .55 },
  },
  'sharptail-prairie': {
    style: 'open-covey', region: 'NORTHERN PRAIRIE',
    description: 'Wide grass, distant shelterbelts, and wild birds that reward a long cast.',
    method: 'WIND LANE · LONG CAST',
    tip: 'Keep the dog moving through the wind lanes. Save your approach for the covey edge, not the open center.',
    guidance: 'Use the wind lanes and let the dog range across the open.', dogRangeMult: 1.28, dogEdgeBias: -.03, coverWorkMult: .72, dogPaceMult: 1.05,
    pointNerveMult: 1.18, pointRadius: 25, hunterSpookRadius: 24, sprintNerveMult: 1.75, runnerStyle: 'default', circleBack: false, spatialEncounter: true,
    flight: { lateral: 1.22, climb: .82, carry: 1.15, wobble: .72 },
  },
  'grouse-woods': {
    style: 'woods', region: 'NORTH WOODS',
    description: 'Young timber, alder runs, and grouse that explode before the woods give you a second look.',
    method: 'CLOSE TIMBER · QUICK POINT',
    tip: 'Shorten the cast and keep the dog in sight. A close point is safer than a long chase through timber.',
    guidance: 'Stay close. Let the dog own the next opening in the timber.', dogRangeMult: .72, dogEdgeBias: .12, coverWorkMult: .62, dogPaceMult: .88,
    pointNerveMult: 1.32, pointRadius: 13, hunterSpookRadius: 22, sprintNerveMult: 2.2, runnerStyle: 'default', circleBack: false, spatialEncounter: true,
    flight: { lateral: 1.32, climb: .72, carry: .92, wobble: 1.5 },
  },
  'woodcock-bottoms': {
    style: 'bottoms', region: 'ALDER BOTTOMS',
    description: 'Wet alder, soft ground, and solitary woodcock that rise in a crooked, climbing line.',
    method: 'WET EDGE · SLOW AND CLOSE',
    tip: 'Walk slowly through the wet edges and trust a careful dog. The shot opens for a heartbeat, then the bird is in the canopy.',
    guidance: 'Keep the pace quiet through the wet edges.', dogRangeMult: .68, dogEdgeBias: .18, coverWorkMult: 1.34, dogPaceMult: .74,
    pointNerveMult: .72, pointRadius: 11, hunterSpookRadius: 18, sprintNerveMult: 1.35, runnerStyle: 'default', circleBack: false, spatialEncounter: true,
    flight: { lateral: 1.5, climb: 1.45, carry: .72, wobble: 1.8 },
  },
  'hun-benches': {
    style: 'bench-covey', region: 'GREAT BASIN',
    description: 'Dry benches, bunchgrass, and gray coveys that can circle back over the next rise.',
    method: 'BENCH FLANK · MARK THE RETURN',
    tip: 'Flank the bench and keep your dog below the wind. A wild covey may settle again; mark the direction and hunt it twice.',
    guidance: 'Flank the bench. Give a wild covey room to circle back.', dogRangeMult: 1.14, dogEdgeBias: .04, coverWorkMult: .9, dogPaceMult: .98,
    pointNerveMult: 1.05, pointRadius: 20, hunterSpookRadius: 26, sprintNerveMult: 1.65, runnerStyle: 'default', circleBack: true, spatialEncounter: true,
    flight: { lateral: 1.12, climb: .8, carry: 1.08, wobble: .86 },
  },
  'chukar-ridge': {
    style: 'chukar', region: 'HIGH DESERT',
    description: 'Silver sage, broken rimrock, and a dog working the wind. Follow the benches to the high ground.',
    method: 'CONTOUR CLIMB · HIGH SIDE',
    tip: 'Use the benches to gain the high side before closing on your dog. Walk into the point; rushing uphill can send the covey over the ridge out of sight.',
    guidance: 'Gain the high side. Walk into the point.', dogRangeMult: 1.18, dogEdgeBias: .08, coverWorkMult: .84, dogPaceMult: .92,
    pointNerveMult: 1.12, pointRadius: 18, hunterSpookRadius: 24, sprintNerveMult: 1.8, runnerStyle: 'chukar', circleBack: false, spatialEncounter: true,
    flight: { lateral: .62, climb: .42, carry: 1.28, wobble: .42 },
  },
  'desert-washes': {
    style: 'desert-wash', region: 'SONORAN DESERT',
    description: 'Thornscrub washes, ocotillo shade, and desert coveys that run for the next pocket of water.',
    method: 'WASH CHAIN · SHADE TO SHADE',
    tip: 'Link the washes from water to water. Keep the dog in the shade and expect a fast, low covey break.',
    guidance: 'Hunt the wash from water to water.', dogRangeMult: 1.06, dogEdgeBias: .1, coverWorkMult: .78, dogPaceMult: .98,
    pointNerveMult: 1.22, pointRadius: 18, hunterSpookRadius: 34, sprintNerveMult: 2, runnerStyle: 'desert', circleBack: false, spatialEncounter: true,
    flight: { lateral: 1.08, climb: .64, carry: 1.18, wobble: .9 },
  },
  'mearns-canyons': {
    style: 'canyon', region: 'OAK CANYONS',
    description: 'Oak shadow, steep draws, and Montezuma quail that hold until your boot moves the cover.',
    method: 'OAK DRAW · PATIENT APPROACH',
    tip: 'Climb the draw slowly and keep your dog inside the oak shadow. Your best shot comes from a patient, close approach.',
    guidance: 'Climb the draw slowly through the oak shadow.', dogRangeMult: .78, dogEdgeBias: .2, coverWorkMult: 1.38, dogPaceMult: .72,
    pointNerveMult: .7, pointRadius: 12, hunterSpookRadius: 18, sprintNerveMult: 1.3, runnerStyle: 'default', circleBack: false, spatialEncounter: true,
    flight: { lateral: 1.28, climb: 1.18, carry: .8, wobble: 1.35 },
  },
  'timberline-parks': {
    style: 'alpine-edge', region: 'HIGH ROCKIES',
    description: 'Spruce islands, wind-scoured parks, and blue grouse holding on the edge between timber and sky.',
    method: 'PARK EDGE · CLIMB AND FINGER',
    tip: 'Climb to the park edge, then let the dog search the timber fingers. Keep the wind on your face before crossing open ground.',
    guidance: 'Climb to the timberline edge and work the fingers.', dogRangeMult: .94, dogEdgeBias: .08, coverWorkMult: 1.02, dogPaceMult: .86,
    pointNerveMult: 1.08, pointRadius: 16, hunterSpookRadius: 22, sprintNerveMult: 1.7, runnerStyle: 'default', circleBack: false, spatialEncounter: true,
    flight: { lateral: 1.2, climb: .96, carry: 1.08, wobble: 1.05 },
  },
  'valley-oaks': {
    style: 'oak-savanna', region: 'PACIFIC VALLEYS',
    description: 'Open oak shade, grass lanes, and California quail moving between the trunks in tight coveys.',
    method: 'OAK SKIRT · SHADE TO SHADE',
    tip: 'Work shade to shade and keep the dog quartering between the oak skirts. A covey may split around a trunk before it rises.',
    guidance: 'Work from oak shadow to oak shadow.', dogRangeMult: 1.02, dogEdgeBias: .1, coverWorkMult: 1.08, dogPaceMult: .92,
    pointNerveMult: .92, pointRadius: 19, hunterSpookRadius: 28, sprintNerveMult: 1.7, runnerStyle: 'default', circleBack: false, spatialEncounter: true,
    flight: { lateral: 1.04, climb: 1.02, carry: .98, wobble: 1.12 },
  },
};

export function huntingDoctrine(areaId: string): HuntDoctrine {
  return DOCTRINES[areaId] ?? GENERAL;
}

/** Resolve style-only tuning for presentation adapters that do not know an area id. */
export function huntDoctrineForStyle(style: HuntStyle | undefined): HuntDoctrine {
  if (!style) return GENERAL;
  // `open-covey` is the shared fallback label. Sharptail uses the same
  // habitat family but gets its exact range and pressure from huntAreaId in
  // the simulation; resolving this style alone must remain neutral.
  if (style === 'open-covey') return GENERAL;
  return Object.values(DOCTRINES).find((doctrine) => doctrine.style === style) ?? GENERAL;
}

/**
 * Score the kind of ground a doctrine is trying to hunt. This is deliberately
 * a small, renderer-neutral vocabulary: the landscape supplies slope,
 * vegetation, moisture, and exposed rock, while the doctrine decides which
 * combination is useful to the dog and the birds.
 *
 * Keeping this beside the doctrine prevents encounter placement, dog cover
 * selection, and future map tools from quietly inventing different ecology.
 */
export function huntHabitatAffinity(
  doctrine: HuntDoctrine,
  surface: Pick<GroundSample, 'slope' | 'rockiness' | 'vegetation' | 'moisture'>,
): number {
  const slope = Math.max(0, Math.min(1, surface.slope / 1.2));
  const vegetation = Math.max(0, Math.min(1, surface.vegetation));
  const moisture = Math.max(0, Math.min(1, surface.moisture));
  const rock = Math.max(0, Math.min(1, surface.rockiness));
  const soft = 1 - rock;
  const flat = 1 - slope;
  switch (doctrine.style) {
    case 'pheasant':
      return moisture * .72 + vegetation * .28;
    case 'bottoms':
      return moisture * .84 + flat * .16;
    case 'woods':
      return vegetation * .68 + moisture * .22 + flat * .1;
    case 'chukar':
      return rock * .52 + slope * .38 + vegetation * .1;
    case 'bench-covey':
      return flat * .54 + vegetation * .32 + soft * .14;
    case 'desert-wash':
      return moisture * .62 + vegetation * .3 + soft * .08;
    case 'canyon':
      return vegetation * .58 + slope * .22 + moisture * .12 + soft * .08;
    case 'alpine-edge':
      return vegetation * .42 + rock * .3 + slope * .2 + moisture * .08;
    case 'oak-savanna':
      return vegetation * .68 + soft * .2 + moisture * .12;
    case 'quail':
    case 'open-covey':
    default:
      return vegetation * .62 + flat * .28 + soft * .1;
  }
}
