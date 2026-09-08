import { enableOfflineHunts } from './offline';
import { prepareHuntUrl } from '../game/huntSeed';
import { FieldInterface, preferredQuality } from './fieldInterface';
import { FieldAudioSystem } from './subsystems/fieldAudio';
import { Engine } from './engine';
import type { TimeOfDay } from './palette';
import { SkySystem } from './subsystems/sky';
import { TerrainSystem } from './subsystems/terrain';
import { Hunt3DSystem, type WorldPatch } from './subsystems/hunt3d';
import { PlayerSystem } from './subsystems/player';
import { DogSystem } from './subsystems/dog';
import { GeneratedDogSystem } from './subsystems/generatedDog';
import { RiggedDogSystem } from './subsystems/riggedDog';
import { BirdsSystem } from './subsystems/birds';
import { GunSystem } from './subsystems/gun';
import { HuntHudSystem } from './subsystems/huntHud';
import { FieldMapSystem } from './subsystems/fieldMap';
import { LandmarksSystem } from './subsystems/landmarks';
import { LandscapeModel } from '../game/landscape';
import { createLandscapeVisuals } from './landscapeVisuals';
import {
  ENGLISH_SETTER_COATS,
  resolveEnglishSetterCoat,
} from './dogs/englishSetter';
import {
  GSP_COATS,
  resolveGspCoat,
} from './dogs/germanShorthairedPointer';
import {
  parseDropPointId,
  parseHuntLaunch,
  resolveThreeHuntArea,
  resolveThreeHuntProfile,
} from '../game/gameplayMode';

/*
 * Uplandin 3D entry. Boot order = subsystem registration order; the
 * capture API (window.__api3d / __ready3d) is the contract every visual
 * critic in the pipeline drives — keep it stable.
 */

// Persist this visit's seed in its URL so display changes and reloads preserve
// its hunt. Hunt again removes it; the following boot creates a fresh visit.
if (['quail-fields', 'pheasant-coverts'].includes(resolveThreeHuntArea(location.search).id)) {
  const seeded = prepareHuntUrl(location.href);
  if (seeded.href !== location.href) history.replaceState(null, '', seeded);
}
const params = new URLSearchParams(location.search);
const quality = preferredQuality(params);
const launch = parseHuntLaunch(location.search);
const launchArea = resolveThreeHuntArea(location.search);
const launchProfile = resolveThreeHuntProfile(location.search);
const landscape = new LandscapeModel(launchArea, parseDropPointId(location.search));
const landscapeVisuals = createLandscapeVisuals(landscape);
const visualBreedFor = (breedId: string) => breedId === 'gsp' ? 'gsp' : 'english-setter';
const visualBreed = visualBreedFor(launchProfile.breedId);
const coatId = visualBreed === 'gsp'
  ? resolveGspCoat(params.get('coat') ?? 'liver-white')
  : resolveEnglishSetterCoat(params.get('coat'));

const canvas = document.getElementById('game3d') as HTMLCanvasElement;
const engine = new Engine(canvas, quality);
const fieldInterface = new FieldInterface(engine, landscape);

engine.register(new SkySystem(landscape));
engine.register(new TerrainSystem(landscape));
// Player first: hunt3d frames the opening covey from the player's authored
// spawn heading. It still precedes grass, which reads the hunt's cover map.
engine.register(new PlayerSystem(landscape));
engine.register(new Hunt3DSystem(landscape));
engine.register(new FieldMapSystem());
for (const system of landscapeVisuals.systems) engine.register(system);
engine.register(new LandmarksSystem());
engine.register(visualBreed === 'gsp' && coatId === 'liver-white' && params.get('dog') === 'generated'
  ? new GeneratedDogSystem()
  : launchArea.id === 'quail-fields' && visualBreed === 'gsp' && coatId === 'liver-white'
    ? new RiggedDogSystem() : new DogSystem(visualBreed, coatId));
if (launchProfile.brace) {
  const braceVisualBreed = visualBreedFor(launchProfile.brace.breedId);
  const braceCoat = braceVisualBreed === 'gsp' ? resolveGspCoat(null) : resolveEnglishSetterCoat(null);
  engine.register(new DogSystem(braceVisualBreed, braceCoat, 1));
}
engine.register(new BirdsSystem());
engine.register(new GunSystem());
engine.register(new HuntHudSystem());
engine.register(new FieldAudioSystem());

// Lightweight review control for the standalone 3D build. Changing coats
// reloads the page because geometry colors are authored once at init; capture
// mode remains clean and deterministic.
const breedPicker = document.getElementById('dog-breed') as HTMLSelectElement | null;
const coatPicker = document.getElementById('dog-coat') as HTMLSelectElement | null;
const coatLabel = document.getElementById('dog-coat-label');
const coatPanel = document.getElementById('dog-appearance') as HTMLElement | null;
const controls = document.getElementById('controls') as HTMLElement | null;
if (controls) controls.hidden = params.has('capture');
if (coatPicker && coatPanel) {
  coatPanel.hidden = !params.has('dev') || params.has('capture') || launch !== null;
  if (breedPicker) {
    const visualBreeds = [
      { id: 'english-setter', label: 'English Setter' },
      { id: 'gsp', label: 'German Shorthaired Pointer' },
    ];
    for (const breed of visualBreeds) {
      const option = document.createElement('option');
      option.value = breed.id;
      option.textContent = breed.label;
      option.selected = breed.id === visualBreed;
      breedPicker.append(option);
    }
    breedPicker.addEventListener('change', () => {
      const next = new URL(location.href);
      next.searchParams.set('breed', breedPicker.value);
      next.searchParams.delete('coat');
      location.assign(next);
    });
  }
  if (coatLabel) coatLabel.textContent = visualBreed === 'gsp' ? 'GSP coat' : 'English Setter coat';
  const coats = visualBreed === 'gsp' ? GSP_COATS : ENGLISH_SETTER_COATS;
  for (const coat of coats) {
    const option = document.createElement('option');
    option.value = coat.id;
    option.textContent = coat.label;
    option.selected = coat.id === coatId;
    coatPicker.append(option);
  }
  coatPicker.addEventListener('change', () => {
    const next = new URL(location.href);
    next.searchParams.set(
      'coat',
      visualBreed === 'gsp'
        ? resolveGspCoat(coatPicker.value)
        : resolveEnglishSetterCoat(coatPicker.value),
    );
    location.assign(next);
  });
}

declare global {
  interface Window {
    __ready3d?: boolean;
    __api3d?: {
      setTod(tod: TimeOfDay): void;
      telemetry(): ReturnType<typeof readTelemetry>;
      pause(paused: boolean): void;
      setPose(x: number, z: number, yawDeg: number, pitchDeg?: number): void;
      renderOnce(): void;
      info(): { calls: number; triangles: number };
      /** Advance the (capture-frozen) sim by exact 30 Hz ticks. */
      stepSim(ticks: number): void;
      /**
       * Advance ONLY the covey-rise presentation (the 2D scene-cut,
       * translated: field time holds its breath while the rise plays —
       * the pointing dog stands under the exploding birds).
       */
      stepRise(ticks: number): void;
      /** Walk the mapped hunter in and flush the pointed covey (sim law). */
      triggerFlush(): { ids: number[]; distPx: number } | null;
      /** Airborne rise birds, world meters — capture telemetry. */
      birds(): { simId: number; x: number; y: number; z: number; airMs: number; status: string }[];
      /** Capture/test hook: route a staged hit through sim and presentation. */
      downBird(simId: number): boolean;
      groundedBirds(): number[];
      /** Sim snapshot in world meters — capture poses shots off this. */
      hunt(): {
        seed?: number;
        dog: {
          x: number;
          z: number;
          state: string;
          heading: number;
          gait: string;
          scentStage: string;
          scentProgress: number;
          carryingBirdId: number | null;
        };
        hunter: { x: number; y: number; z: number };
        tally: { downed: number; retrieved: number; escaped: number; hidden: number; flushed: number };
        /** Read-only evidence of singles; never displayed as hidden-bird GPS. */
        singles: { id: number; state: string; x: number; z: number }[];
        patches: readonly WorldPatch[];
        simMs: { last: number; max: number; avg: number };
      };
      gun(): { mount: number; shells: number };
    };
  }
}

engine.start(fieldInterface.loading).then((started) => {
  if (!started) return;
  const requestedTod = params.get('tod');
  const tod: TimeOfDay = requestedTod && ['dawn','morning','noon','evening','lastlight'].includes(requestedTod)
    ? requestedTod as TimeOfDay : launchArea.id === 'quail-fields' ? 'morning' : 'dawn';
  engine.setTimeOfDay(tod);
  window.__api3d = {
    telemetry: readTelemetry,
    pause: (paused) => engine.pause(paused),
    setTod: (t) => engine.setTimeOfDay(t),
    setPose: (x, z, yaw, pitch) => engine.ctx.get<PlayerSystem>('player').setPose(engine.ctx, x, z, yaw, pitch),
    renderOnce: () => engine.renderOnce(),
    info: () => ({
      calls: engine.ctx.renderer.info.render.calls,
      triangles: engine.ctx.renderer.info.render.triangles,
    }),
    // Field sim and rise presentation advance in lockstep (a no-op for
    // birds until a covey is up); stepRise moves ONLY the rise.
    stepSim: (ticks) => {
      for (let tick = 0; tick < ticks; tick++) {
        engine.ctx.get<Hunt3DSystem>('hunt3d').step(engine.ctx, 1);
        engine.ctx.get<BirdsSystem>('birds').step(engine.ctx, 1);
      }
    },
    stepRise: (ticks) => engine.ctx.get<BirdsSystem>('birds').step(engine.ctx, ticks),
    triggerFlush: () => engine.ctx.get<Hunt3DSystem>('hunt3d').triggerFlush(engine.ctx),
    birds: () => engine.ctx.get<BirdsSystem>('birds').airborne(),
    downBird: (simId) => {
      const hunt = engine.ctx.get<Hunt3DSystem>('hunt3d');
      const birds = engine.ctx.get<BirdsSystem>('birds');
      return hunt.resolveBird(simId, 'downed') && birds.downBird(simId);
    },
    groundedBirds: () => engine.ctx.get<BirdsSystem>('birds').groundedIds(),
    gun: () => {
      const gun = engine.ctx.get<GunSystem>('gun');
      return { mount: gun.mountProgress(), shells: gun.shellsRemaining() };
    },
    hunt: () => {
      const h = engine.ctx.get<Hunt3DSystem>('hunt3d');
      const dogW = h.dogWorld({ x: 0, z: 0 });
      const hunterW = h.simToWorld(h.huntState().hunterPos.x, h.huntState().hunterPos.y, { x: 0, z: 0 });
      return {
        seed: h.seed(),
        dog: {
          x: dogW.x,
          z: dogW.z,
          state: h.dog().state,
          heading: h.dog().heading,
          gait: h.dog().gait,
          scentStage: h.dog().scentStage,
          scentProgress: h.dog().scentProgress,
          carryingBirdId: h.dog().carryingBirdId,
        },
        hunter: { x: hunterW.x, y: engine.ctx.camera.position.y, z: hunterW.z },
        tally: {
          downed: h.huntState().downed,
          retrieved: h.huntState().birds.filter((bird) => bird.state === 'retrieved').length,
          escaped: h.huntState().escaped,
          hidden: h.huntState().birds.filter((bird) => bird.state === 'hidden').length,
          flushed: h.huntState().birds.filter((bird) => bird.state === 'flushed').length,
        },
        patches: h.coverPatches(),
        singles: h.huntState().birds.filter(bird => bird.single).map(bird => ({
          id: bird.id, state: bird.state, ...h.simToWorld(bird.pos.x, bird.pos.y, { x: 0, z: 0 }),
        })),
        simMs: h.simMs(),
      };
    },
  };
  // Two settle frames so shadows/fog are warm before any capture.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    engine.renderOnce();
    fieldInterface.ready();
    enableOfflineHunts();
    window.__ready3d = true;
  }));
 }).catch((error) => fieldInterface.failed(error));

function readTelemetry() {
  const camera = engine.ctx.camera;
  const hunt = engine.ctx.get<Hunt3DSystem>('hunt3d');
  const dog = hunt.dog();
  const position = hunt.dogRenderWorld(engine.ctx.fixedAlpha, { x: 0, z: 0 });
  const pointed = hunt.huntState().birds.find((bird) => bird.id === dog.pointedBirdId);
  const pointedWorld = pointed ? hunt.simToWorld(pointed.pos.x, pointed.pos.y, { x: 0, z: 0 }) : null;
  return {
    ...engine.telemetry(),
    camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z,
      yawDeg: camera.rotation.y * 180 / Math.PI, pitchDeg: camera.rotation.x * 180 / Math.PI, fov: camera.fov },
    dog: { ...position, heading: dog.heading, state: dog.state, scentStage: dog.scentStage, carryingBirdId: dog.carryingBirdId },
    pointedBird: pointedWorld ? { ...pointedWorld, id: pointed!.id } : null,
    rise: hunt.lastFlushInfo(),
    carriedBirds: engine.ctx.get<BirdsSystem>('birds').carriedTransforms(),
    launchCover: engine.ctx.get<BirdsSystem>('birds').launchCoverAudit(),
    simMs: hunt.simMs(),
  };
}
window.addEventListener('pagehide', () => { fieldInterface.dispose(); engine.dispose(); }, { once: true });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
