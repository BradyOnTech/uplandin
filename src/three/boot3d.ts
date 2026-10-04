import { frameTailgate, stageTailgate } from './tailgatePhoto';
import { huntAssists, onHuntAssists } from './assistsRuntime';
import { isFalconryPractice, FALCONRY_PRACTICE } from '../game/falconryPractice';
import { bindFieldPageLifecycle } from './pageLifecycle';
import { enableOfflineHunts, prepareInstalledHuntUrl } from './offline';
import { createPerformanceCapture, type PerformanceCapture } from './performanceCapture';
import { shotAssistancePreference, shotSightPicture, touchSensitivity, usesTouchControls } from './inputMode';
import { prepareHuntUrl } from '../game/huntSeed';
import { FieldInterface, preferredQuality } from './fieldInterface';
import { FieldAudioSystem } from './subsystems/fieldAudio';
import { Engine } from './engine';
import { PostEffects, supportsScreenEffects } from './postEffects';
import { DEFAULT_LOOK, fieldLook, LOOK_IDS, LOOKS, resolveLook, type LookId } from './looks';
import type { TimeOfDay } from './palette';
import { SkySystem } from './subsystems/sky';
import { TerrainSystem } from './subsystems/terrain';
import { Hunt3DSystem, type WorldPatch } from './subsystems/hunt3d';
import { PlayerSystem } from './subsystems/player';
import { GeneratedDogSystem } from './subsystems/generatedDog';
import { generatedCoatFor } from './dogs/generatedGsp';
import { DOG_STYLE_LABELS, DOG_STYLE_SELECTABLE, effectiveDogStyle, preferredDogStyle, resolveDogStyle } from './dogs/dogStyle';
import { coatLabel as coatName, coatsForBreed, modelForBreed, resolveCoatFor, type ModeledBreedId } from '../game/dogCoats';
import { BREEDS } from '../game/breeds';
import { BirdsSystem } from './subsystems/birds';
import { resolveBirdSize } from './birdScale';
import { FalconrySystem } from './subsystems/falconry';
import './falconry.css';
import { GunSystem } from './subsystems/gun';
import { HuntHudSystem } from './subsystems/huntHud';
import { FieldMapSystem } from './subsystems/fieldMap';
import { LandmarksSystem } from './subsystems/landmarks';
import { LandscapeModel } from '../game/landscape';
import { createLandscapeVisuals } from './landscapeVisuals';
import {
  build3DPreparationHref,
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
const installedLaunch = prepareInstalledHuntUrl(location.href);
if (installedLaunch.href !== location.href) history.replaceState(null, '', installedLaunch);
if (isFalconryPractice(location.search)) {
  const url = new URL(location.href);
  url.searchParams.set('drop', FALCONRY_PRACTICE.drop);
  if (!url.searchParams.has('tod')) url.searchParams.set('tod', 'morning');
  history.replaceState(null, '', url);
}
const seeded = prepareHuntUrl(location.href);
if (seeded.href !== location.href) history.replaceState(null, '', seeded);
const params = new URLSearchParams(location.search);
const quality = preferredQuality(params);
const launch = parseHuntLaunch(location.search);
const launchArea = resolveThreeHuntArea(location.search);
const launchProfile = resolveThreeHuntProfile(location.search);
const landscape = new LandscapeModel(launchArea, parseDropPointId(location.search));
const landscapeVisuals = createLandscapeVisuals(landscape);
// Breeds without a model of their own borrow the setter's (dogCoats.ts).
const visualBreedFor = (breedId: string): ModeledBreedId => modelForBreed(breedId);
const visualBreed = visualBreedFor(launchProfile.breedId);
// A launch carries the chosen coat; the saved kennel dog or Quick setup is
// the fallback for older links. The URL wins so review links stay exact.
const coatId = resolveCoatFor(visualBreed, params.get('coat')
  ?? launchProfile.kennelDog?.coatId ?? launchProfile.quick?.coatId);

const canvas = document.getElementById('game3d') as HTMLCanvasElement;
const engine = new Engine(canvas, quality);
// Screen effects (ambient occlusion, ground haze, bloom and the colour grade)
// belong to desktop High: the Crisp autumn look, chosen October 2026. A link
// with `?look=off` renders without them and `?look=golden|natural` shows
// another look; either one lets L cycle the looks and the plain render for
// comparison in motion. Lightweight never renders screen effects.
let fieldEffects: PostEffects | null = null;
{
  const lookParam = params.get('look');
  const look = fieldLook(lookParam, quality);
  const comparing = quality === 'high' && (lookParam === 'off' || resolveLook(lookParam) !== null);
  if ((look || comparing) && supportsScreenEffects(engine.ctx.renderer)) {
    const effects = fieldEffects = new PostEffects(LOOKS[look ?? DEFAULT_LOOK]);
    effects.setDebug(Number(params.get('lookdebug')) || 0);
    effects.setTimeOfDay(engine.ctx.timeOfDay);
    effects.setGround(launchArea.id);
    engine.ctx.events.addEventListener('tod', event => effects.setTimeOfDay((event as CustomEvent<TimeOfDay>).detail));
    engine.setPipeline(look ? effects : null);
    if (comparing) {
      const order: (LookId | 'off')[] = [...LOOK_IDS, 'off'];
      let current: LookId | 'off' = look ?? 'off';
      const label = document.createElement('div');
      label.className = 'look-label';
      Object.assign(label.style, { position: 'fixed', left: '50%', top: '14px', transform: 'translateX(-50%)', zIndex: '40',
        padding: '6px 12px', borderRadius: '6px', background: 'rgba(16,26,22,.78)', color: '#ece5d2',
        font: '600 13px system-ui, sans-serif', pointerEvents: 'none', transition: 'opacity .4s', opacity: '0' });
      document.body.append(label);
      let hide = 0;
      window.addEventListener('keydown', event => {
        if (event.code !== 'KeyL' || event.repeat || (event.target as HTMLElement | null)?.closest?.('input, textarea, select')) return;
        current = order[(order.indexOf(current) + 1) % order.length];
        if (current === 'off') engine.setPipeline(null);
        else {
          effects.setLook(LOOKS[current]);
          engine.setPipeline(effects);
        }
        label.textContent = current === 'off' ? 'Look: off (no screen effects) · L to cycle' : `Look: ${LOOKS[current].label} · L to cycle`;
        label.style.opacity = '1';
        clearTimeout(hide); hide = window.setTimeout(() => { label.style.opacity = '0'; }, 1800);
      });
    }
  }
}
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
// Every breed draws on the one skinned rig and its motion, in two looks:
// smooth and faceted. Each breed draws in its house look (a smooth GSP, a
// faceted setter and Griffon); `dogstyle` applies only while the style
// switch is open.
const dogStyle = resolveDogStyle(params.get('dogstyle')) ?? preferredDogStyle();
const dogSystemFor = (breed: ModeledBreedId, coat: string, slot = 0) => {
  const style = effectiveDogStyle(breed, dogStyle);
  return new GeneratedDogSystem(generatedCoatFor(breed, coat), slot, style);
};
engine.register(dogSystemFor(visualBreed, coatId));
if (launchProfile.brace) {
  const braceVisualBreed = visualBreedFor(launchProfile.brace.breedId);
  const braceCoat = resolveCoatFor(braceVisualBreed, params.get('coat2')
    ?? launchProfile.brace.kennelDog?.coatId ?? launchProfile.quick?.coat2Id);
  engine.register(dogSystemFor(braceVisualBreed, braceCoat, 1));
}
// The arrival and pause card names the dog (or brace) the player chose.
{
  const section = document.getElementById('field-dog');
  if (section && !params.has('capture')) {
    const lead = launchProfile.kennelDog, mate = launchProfile.brace;
    const leadStyle = effectiveDogStyle(visualBreed, dogStyle);
    const breedName = (id: string) => BREEDS.find(b => b.id === id)?.name ?? 'Bird dog';
    document.getElementById('field-dog-name')!.textContent = lead?.name ?? breedName(launchProfile.breedId);
    document.getElementById('field-dog-detail')!.textContent = [lead ? breedName(lead.breedId) : null, coatName(visualBreed, coatId),
      DOG_STYLE_SELECTABLE ? `${DOG_STYLE_LABELS[leadStyle].label} style` : null,
      mate ? `with ${mate.kennelDog?.name ?? breedName(mate.breedId)}` : null].filter(Boolean).join(' · ');
    const art = document.getElementById('field-dog-art') as HTMLImageElement, base = `${import.meta.env.BASE_URL}art/menus3d/dogs/${visualBreed}-${leadStyle}`;
    art.addEventListener('error', () => { if (!art.src.endsWith(`${leadStyle}.webp`)) art.src = `${base}.webp`; });
    art.src = `${base}-${coatId}.webp`;
    const change = document.getElementById('field-dog-change') as HTMLAnchorElement;
    change.href = `${build3DPreparationHref(location.search, landscape.area.id, landscape.dropPoint.id)}&step=dog`;
    section.hidden = false;
  }
}
// Flying birds draw at true size up close and ease to the readable enlargement
// by shotgun range (birdScale.ts). `?birds=readable` or `?birds=true` compare.
engine.register(new BirdsSystem({ size: resolveBirdSize(params.get('birds')) }));
engine.register(new FalconrySystem());
engine.register(new GunSystem());
engine.register(new HuntHudSystem());
engine.register(new FieldAudioSystem(launchArea.id));

// Lightweight review control for the standalone 3D build. Changing coats
// reloads the page because geometry colors are authored once at init; capture
// mode remains clean and deterministic.
const breedPicker = document.getElementById('dog-breed') as HTMLSelectElement | null;
const coatPicker = document.getElementById('dog-coat') as HTMLSelectElement | null;
const coatLabel = document.getElementById('dog-coat-label');
const coatPanel = document.getElementById('dog-appearance') as HTMLElement | null;
const controls = document.getElementById('controls') as HTMLElement | null;
const applyHints = () => { if (controls) controls.hidden = params.has('capture') || !huntAssists().hints; };
applyHints(); onHuntAssists(applyHints);
if (coatPicker && coatPanel) {
  coatPanel.hidden = !params.has('dev') || params.has('capture') || launch !== null;
  if (breedPicker) {
    const visualBreeds = [
      { id: 'english-setter', label: 'English Setter' },
      { id: 'gsp', label: 'German Shorthaired Pointer' },
      { id: 'griffon', label: 'Wirehaired Pointing Griffon' },
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
  if (coatLabel) coatLabel.textContent = ({ gsp: 'GSP coat', 'english-setter': 'English Setter coat', griffon: 'Griffon coat' } as const)[visualBreed];
  const coats = coatsForBreed(visualBreed);
  for (const coat of coats) {
    const option = document.createElement('option');
    option.value = coat.id;
    option.textContent = coat.label;
    option.selected = coat.id === coatId;
    coatPicker.append(option);
  }
  coatPicker.addEventListener('change', () => {
    const next = new URL(location.href);
    next.searchParams.set('coat', resolveCoatFor(visualBreed, coatPicker.value));
    location.assign(next);
  });
}

declare global {
  interface Window {
    __performance3d?: PerformanceCapture;
    __ready3d?: boolean;
    __api3d?: {
      setTod(tod: TimeOfDay): void;
      telemetry(): ReturnType<typeof readTelemetry>;
      pause(paused: boolean): void;
      setPose(x: number, z: number, yawDeg: number, pitchDeg?: number, lift?: number): void;
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
      advanceClock(seconds: number): void;
      /** Walk the mapped hunter in and flush the pointed covey (sim law). */
      triggerFlush(): { ids: number[]; distPx: number } | null;
      /** Airborne rise birds, world meters — capture telemetry. */
      birds(): { simId: number; x: number; y: number; z: number; airMs: number; status: string; speciesId: string; sex?: 'hen' | 'rooster' }[];
      /** Capture/test hook: route a staged hit through sim and presentation,
       * optionally as a particular hit reaction (a spiral comes down wounded). */
      downBird(simId: number, reaction?: 'fold' | 'tower' | 'sail' | 'spiral'): boolean;
      /** Capture/test hook: a second shot into a hit bird still in the air. */
      anchorBird(simId: number): boolean;
      groundedBirds(): number[];
      /** A bird on the ground, world metres, and whether it is running. */
      groundedAt(simId: number): { x: number; y: number; z: number; running: boolean } | null;
      /** Capture: stage and frame the tailgate photo, with the hunt's bag or a staged one. */
      tailgate(bag?: { speciesId: string; sex?: 'hen' | 'rooster' }[]): boolean;
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
          searchAreaChecked: boolean;
          carryingBirdId: number | null;
          raptorDuty: 'approaching' | 'guarding' | null;
        };
        hunter: { x: number; y: number; z: number };
        tally: { downed: number; retrieved: number; escaped: number; hidden: number; flushed: number };
        /** Read-only evidence of singles; never displayed as hidden-bird GPS. */
        singles: { id: number; state: string; x: number; z: number }[];
        patches: readonly WorldPatch[];
        simMs: { last: number; max: number; avg: number };
      };
      gun(): { mount: number; shells: number };
      /** Look development: the screen-effects pipeline, or null without one. */
      effects(): PostEffects | null;
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
    setPose: (x, z, yaw, pitch, lift) => engine.ctx.get<PlayerSystem>('player').setPose(engine.ctx, x, z, yaw, pitch, lift),
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
        engine.ctx.get<FalconrySystem>('falconry').step(engine.ctx, 1000/30);
      }
    },
    stepRise: (ticks) => engine.ctx.get<BirdsSystem>('birds').step(engine.ctx, ticks),
    // Capture tooling: move the field clock (wind, cover wakes) between renders.
    advanceClock: (seconds) => { engine.ctx.time += Math.max(0, seconds); },
    triggerFlush: () => engine.ctx.get<Hunt3DSystem>('hunt3d').triggerFlush(engine.ctx),
    birds: () => engine.ctx.get<BirdsSystem>('birds').airborne(),
    downBird: (simId, reaction) => {
      const hunt = engine.ctx.get<Hunt3DSystem>('hunt3d');
      const birds = engine.ctx.get<BirdsSystem>('birds');
      return hunt.resolveBird(simId, 'downed', undefined, reaction === 'spiral' ? { wounded: true } : {})
        && birds.downBird(simId, undefined, undefined, reaction);
    },
    anchorBird: (simId) => engine.ctx.get<BirdsSystem>('birds').anchorBird(simId)
      && engine.ctx.get<Hunt3DSystem>('hunt3d').anchorBird(simId),
    groundedBirds: () => engine.ctx.get<BirdsSystem>('birds').groundedIds(),
    groundedAt: (simId) => engine.ctx.get<BirdsSystem>('birds').groundedAt(simId),
    tailgate: (bag) => !!stageTailgate(engine, bag) && frameTailgate(engine),
    effects: () => fieldEffects,
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
          searchAreaChecked: h.dog().searchAreaChecked,
          carryingBirdId: h.dog().carryingBirdId,
          raptorDuty: h.dog().raptorDuty,
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
    enableOfflineHunts({ canReload: () => fieldInterface.canApplyOfflineUpdate(),
      onUpdateState: state => fieldInterface.offlineUpdateState(state) });
    if (params.get('diagnostics') === '1') {
      const capture = createPerformanceCapture({ engine, context: () => ({
        area: landscape.area.id, drop: landscape.dropPoint.id, seed: params.get('seed'),
        quality: engine.ctx.quality, timeOfDay: engine.ctx.timeOfDay,
        challenge: engine.ctx.get<Hunt3DSystem>('hunt3d').getActiveChallenge(),
        shotAssistance: shotAssistancePreference(),
        controls: usesTouchControls() ? 'touch' : 'desktop', sight: shotSightPicture(usesTouchControls()),
        sensitivity: { look: touchSensitivity('look'), swing: touchSensitivity('swing') },
        camera: { x: engine.ctx.camera.position.x, y: engine.ctx.camera.position.y, z: engine.ctx.camera.position.z,
          yaw: engine.ctx.camera.rotation.y, pitch: engine.ctx.camera.rotation.x, fov: engine.ctx.camera.fov },
      }) });
      window.__performance3d = capture;
      document.getElementById('performance-tools')!.hidden = false;
      document.getElementById('performance-start')!.addEventListener('click', () => {
        capture.start((document.getElementById('performance-route') as HTMLInputElement).value);
        document.getElementById('performance-status')!.textContent = 'Recording. Play the route, then pause and save the report.';
        document.getElementById('enter-field')!.click();
      });
      document.getElementById('performance-save')!.addEventListener('click', () => {
        capture.download();
        document.getElementById('performance-status')!.textContent = 'Performance report saved.';
      });
    }
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
    falconry: hunt.falconry ? {phase:hunt.falconry.phase, position:{...hunt.falconry.position}, targetId:hunt.falconry.targetId, flights:hunt.falconry.flights, catches:hunt.falconry.catches, recovered:hunt.falconry.recovered, misses:hunt.falconry.misses, recalls:hunt.falconry.recalls} : null,
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
bindFieldPageLifecycle(window, () => {
  fieldInterface.pause();
  if (!engine.ctx.paused) engine.pause(true);
}, () => { fieldInterface.dispose(); engine.dispose(); });
