import { describe, expect, it } from 'vitest';
import { getArea } from '../src/game/areas';
import { LandscapeModel, PROPERTY_PX_TO_M, type GroundSample } from '../src/game/landscape';
import { pheasantPondRadii } from '../src/game/pheasantHabitat';

const emptySample = (): GroundSample => ({ height: 0, slope: 0, gradeX: 0, gradeZ: 0, rockiness: 0, vegetation: 0, moisture: 0 });

describe('Pheasant pond influence', () => {
  it('retains the pre-optimization surface where different pond envelopes overlap', () => {
    const area = structuredClone(getArea('pheasant-coverts'));
    const west = area.landmarks.find(l => l.id === 'west-pothole')!.position;
    area.landmarks.find(l => l.id === 'area-feature')!.position = { x: west.x + 45, y: west.y + 10 };
    area.landmarks.find(l => l.id === 'south-slough')!.position = { x: west.x - 8, y: west.y + 26 };
    // Retained from the original sampler, before changing its evaluation.
    // These span different nearest ponds, their shared margin and dry ground.
    const probes = [
      { x: 0, y: 0, height: -1.4560832864903448, gradeX: -.004774950204145941, gradeZ: -.0033662454282901897, moisture: 1 },
      { x: 22, y: 11, height: -.9588434356575808, gradeX: .0169970398881704, gradeZ: .05969152804300074, moisture: .8375450838556905 },
      { x: 43, y: 18, height: -1.343584610778701, gradeX: -.011743162040513658, gradeZ: .049405914357007884, moisture: .9735886588992544 },
      { x: 88, y: 29, height: .9617373886189459, gradeX: .0063342575722939625, gradeZ: .02461959664731724, moisture: .06651754787595376 },
    ];
    for (const drop of ['south-gate', 'west-track']) {
      const landscape = new LandscapeModel(area, drop);
      for (const probe of probes) {
        const world = landscape.propertyToWorld(west.x + probe.x, west.y + probe.y, { x: 0, z: 0 });
        const surface = landscape.surfaceAtWorld(world.x, world.z, emptySample());
        for (const key of ['height', 'gradeX', 'gradeZ', 'moisture'] as const) expect(surface[key]).toBeCloseTo(probe[key], 11);
        expect(Object.values(surface).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('keeps the wet edge and dry shoulder transitions finite and consistent from both entries', () => {
    const area = getArea('pheasant-coverts');
    const south = new LandscapeModel(area, 'south-gate'), west = new LandscapeModel(area, 'west-track');
    for (const pond of area.landmarks.filter(l => l.kind === 'pond')) {
      const radii = pheasantPondRadii(pond.id);
      for (const radius of [0, 1.15, 1.5, 2.7]) for (let spoke = 0; spoke < 16; spoke++) {
        const angle = spoke * Math.PI / 8;
        const x = pond.position.x + Math.cos(angle) * radii.rx * radius / PROPERTY_PX_TO_M;
        const y = pond.position.y + Math.sin(angle) * radii.rz * radius / PROPERTY_PX_TO_M;
        const point = west.propertyToWorld(x, y, { x: 0, z: 0 });
        const a = south.surfaceAtProperty(x, y, emptySample()), b = west.surfaceAtWorld(point.x, point.z, emptySample());
        for (const key of Object.keys(a) as (keyof GroundSample)[]) {
          expect(Number.isFinite(a[key])).toBe(true);
          expect(b[key]).toBeCloseTo(a[key], 10);
        }
        // Crossing a blend boundary must not introduce a visible height step.
        expect(Math.abs(south.heightAtProperty(x + .001, y) - south.heightAtProperty(x - .001, y))).toBeLessThan(.001);
      }
    }
  });
});
