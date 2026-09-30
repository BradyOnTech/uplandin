import { isFalconryPractice } from '../../game/falconryPractice';
import { build3DPreparationHref } from '../../game/gameplayMode';
import { huntComplete } from '../../game/state';
import { nextHuntUrl } from '../../game/huntSeed';
import { huntingDoctrine } from '../../game/huntDoctrine';
import { renderFieldNotes } from '../fieldNotes';
import { focusedFieldDog } from '../fieldDogFocus';
import { dogRelativeBearing, dogWorkLabel, fieldCompassHeading, fieldSearchGuidance, pointApproachCue, pheasantPointGuidance, trackingApproachGuidance } from '../dogLocator';
import type { Ctx, Subsystem } from '../engine';
import type { BirdsSystem } from './birds';
import type { GunSystem } from './gun';
import type { Hunt3DSystem } from './hunt3d';
import type { PlayerSystem } from './player';

/** Touch hints name buttons; keyboard hints name keys. Safe without a DOM. */
const touchControlsActive = () => typeof document !== 'undefined' && !!document.body?.classList.contains('touch-controls-active');

/** DOM presentation adapter for the shared hunt snapshot. */
export class HuntHudSystem implements Subsystem {
  readonly id = 'hunt-hud';

  private hunt!: Hunt3DSystem;
  private birds!: BirdsSystem;
  private gun!: GunSystem;
  private player!: PlayerSystem;
  private panel: HTMLElement | null = null;
  private tally: HTMLElement | null = null;
  private phase: HTMLElement | null = null;
  private beacon: HTMLElement | null = null;
  private fieldIdentity: HTMLElement | null = null;
  private fieldMethod: HTMLElement | null = null;
  private heading: HTMLElement | null = null;
  private truckDirection: HTMLElement | null = null;
  private truckDistance: HTMLElement | null = null;
  private windDirection: HTMLElement | null = null;
  private windStrength: HTMLElement | null = null;
  private guidance: HTMLElement | null = null;
  private locator: HTMLElement | null = null;
  private dogDirection: HTMLElement | null = null;
  private dogStatus: HTMLElement | null = null;
  private dogDistance: HTMLElement | null = null;
  private summary: HTMLElement | null = null;
  private summaryCopy: HTMLElement | null = null;
  private endButton: HTMLButtonElement | null = null;
  private frozen = false;
  private summaryShown = false;
  private seasonEnded = false;
  private lastTally = '';
  private lastRetrieved = 0;
  private deliveryNoticeUntil = 0;
  private lastPhase = '';
  private lastEncounter = '';
  private lastBeacon = '';
  private lastDogAngle = NaN;
  private lastTruckAngle = NaN;
  private lastWindAngle = NaN;
  private fieldTime = 0;
  private nextNavigationUpdate = 0;
  private mainLandmark: { name: string; x: number; z: number } | null = null;
  private truck = { x: 0, z: 0 };
  private dogWorld = { x: 0, z: 0 };
  private abort = new AbortController();
  private dogCallout: HTMLElement | null = null;
  private dogCalloutUntil = 0;

  init(ctx: Ctx): void {
    this.frozen = new URLSearchParams(location.search).has('capture');
    this.hunt = ctx.get<Hunt3DSystem>('hunt3d');
    this.birds = ctx.get<BirdsSystem>('birds');
    this.gun = ctx.get<GunSystem>('gun');
    this.player = ctx.get<PlayerSystem>('player');
    this.panel = document.getElementById('hunt-hud');
    this.tally = document.getElementById('hunt-tally');
    this.phase = document.getElementById('hunt-phase');
    this.beacon = document.getElementById('hunt-beacon');
    this.locator = document.getElementById('dog-locator');
    this.dogDirection = document.getElementById('dog-direction');
    this.dogStatus = document.getElementById('dog-status');
    this.dogDistance = document.getElementById('dog-distance');
    this.summary = document.getElementById('hunt-summary');
    this.summaryCopy = document.getElementById('hunt-summary-copy');
    this.endButton = document.getElementById('end-hunt') as HTMLButtonElement | null;
    if (this.panel) {
      this.panel.hidden = this.frozen;
      // Only encounter changes announce themselves. The compass and distance
      // update continuously and must not interrupt a screen reader every step.
      this.panel.setAttribute('aria-live', 'off');
      this.panel.setAttribute('aria-label', 'Field information');
      this.phase?.setAttribute('aria-live', 'polite');
      const area = this.hunt.areaConfig(), drop = this.hunt.dropPoint();
      const doctrine = huntingDoctrine(area.id);
      this.panel.dataset.area = area.id;
      this.panel.dataset.huntStyle = doctrine.style;
      this.fieldIdentity = document.createElement('div');
      this.fieldIdentity.id = 'field-identity';
      const property = document.createElement('div');
      property.className = 'field-property';
      const name = document.createElement('span');
      name.className = 'field-property-name'; name.textContent = area.name;
      const entry = document.createElement('span');
      entry.className = 'field-property-entry'; entry.textContent = `${drop.name} entry`;
      property.append(name, entry);
      this.heading = document.createElement('span');
      this.heading.id = 'field-heading'; this.heading.setAttribute('aria-label', 'Heading');
      this.fieldIdentity.append(property, this.heading);
      this.panel.prepend(this.fieldIdentity);
      this.fieldMethod = document.createElement('div');
      this.fieldMethod.id = 'field-method-live';
      this.fieldMethod.setAttribute('aria-label', `Hunting method: ${this.hunt.falconry ? 'Goshawk from the fist' : doctrine.method}`);
      const methodLabel = document.createElement('span');
      methodLabel.className = 'field-method-label'; methodLabel.textContent = 'METHOD';
      const methodCopy = document.createElement('span');
      methodCopy.className = 'field-method-copy'; methodCopy.textContent = this.hunt.falconry ? 'GOSHAWK · FROM THE FIST' : doctrine.method;
      this.fieldMethod.append(methodLabel, methodCopy);
      this.panel.append(this.fieldMethod);
      this.guidance = document.createElement('div'); this.guidance.id = 'field-guidance';
      this.guidance.textContent = fieldSearchGuidance(area.id);
      this.panel.append(this.guidance);
      const landmark = area.landmarks.find(item => item.kind !== 'gate');
      if (landmark) {
        const world = this.hunt.simToWorld(landmark.position.x, landmark.position.y, { x: 0, z: 0 });
        this.mainLandmark = { name: landmark.name, x: world.x, z: world.z };
      }
    }
    if (this.beacon) {
      const truck = document.createElement('span'); truck.className = 'field-truck';
      truck.title = `Parked at ${this.hunt.dropPoint().name}`;
      const truckLabel = document.createElement('span'); truckLabel.textContent = 'TRUCK';
      this.truckDirection = document.createElement('span'); this.truckDirection.className = 'field-compass-arrow';
      this.truckDirection.textContent = '↑'; this.truckDirection.setAttribute('aria-hidden', 'true');
      this.truckDistance = document.createElement('span'); this.truckDistance.className = 'field-compass-distance';
      truck.append(truckLabel, this.truckDirection, this.truckDistance);
      const wind = document.createElement('span'); wind.className = 'field-wind';
      wind.title = 'Direction the wind is blowing';
      const windLabel = document.createElement('span'); windLabel.textContent = 'WIND';
      this.windDirection = document.createElement('span'); this.windDirection.className = 'field-compass-arrow';
      this.windDirection.textContent = '↑'; this.windDirection.setAttribute('aria-hidden', 'true');
      this.windStrength = document.createElement('span');
      wind.append(windLabel, this.windDirection, this.windStrength);
      this.beacon.replaceChildren(truck, wind);
    }
    if (this.summary) this.summary.hidden = true;
    const options = { signal: this.abort.signal };
    // What the dog did with a command, or a moment of its work, for a few seconds.
    this.dogCallout = document.getElementById('dog-callout');
    ctx.events.addEventListener('dog-feedback', ((event: CustomEvent<string>) => {
      if (!this.dogCallout || this.frozen) return;
      this.dogCallout.textContent = event.detail;
      this.dogCallout.hidden = false;
      this.dogCalloutUntil = this.fieldTime + 2.8;
    }) as EventListener, options);
    // Graphics may have changed in Pause after this HUD was initialized.
    const preparationHref = () => build3DPreparationHref(location.search, this.hunt.areaConfig().id, this.hunt.dropPoint().id);
    if (isFalconryPractice(location.search)) document.getElementById('hunt-again')!.textContent = 'New drill';
    document.getElementById('hunt-again')?.addEventListener('click', () => {
      location.assign(this.seasonEnded ? preparationHref() : nextHuntUrl(location.href));
    }, options);
    document.getElementById('hunt-menu')?.addEventListener('click', () => location.assign(preparationHref()), options);
    document.getElementById('field-menu')?.addEventListener('click', () => location.assign(preparationHref()), options);
    this.endButton?.addEventListener('click', () => {
      if (!this.birds.isRiseActive() && !this.endButton?.disabled) {
        this.hunt.endHunt();
        // The mobile action lives in Pause; settle/show results without
        // waiting for a running frame or advancing the simulation.
        this.update(ctx, 0);
      }
    }, options);
  }

  update(ctx: Ctx, dt: number): void {
    if (this.frozen) return;
    this.fieldTime += dt;
    if (this.dogCallout && !this.dogCallout.hidden && this.fieldTime >= this.dogCalloutUntil) this.dogCallout.hidden = true;
    const hunt = this.hunt.huntState();
    let downOnGround = 0;
    let retrieved = 0;
    for (const bird of hunt.birds) {
      if (bird.state === 'downed' || bird.state === 'carried') downOnGround++;
      else if (bird.state === 'retrieved') retrieved++;
    }

    const hawk=this.hunt.falconry;
    const tally = hawk ? `Bag ${hawk.recovered} · Flights ${hawk.flights} · Catches ${hawk.catches}` : `Bag ${retrieved} · Down ${downOnGround} · Shells ${this.gun.shellsRemaining()}/${this.gun.shellCapacity()}`;
    if (retrieved > this.lastRetrieved) this.deliveryNoticeUntil = this.fieldTime + 3;
    this.lastRetrieved = retrieved;
    if (tally !== this.lastTally) {
      if (this.tally) this.tally.textContent = tally;
      this.lastTally = tally;
    }

    const dogs = Array.from({ length: this.hunt.dogCount() }, (_, slot) => this.hunt.dog(slot));
    const trackedDog = focusedFieldDog(dogs);
    if (trackedDog) this.hunt.simToWorld(trackedDog.pos.x, trackedDog.pos.y, this.dogWorld);
    const dogDx = this.dogWorld.x - ctx.camera.position.x;
    const dogDz = this.dogWorld.z - ctx.camera.position.z;
    const dogRange = Math.hypot(dogDx, dogDz);
    const rise = this.birds.isRiseActive();
    const encounter = rise ? 'rise' : trackedDog?.state === 'pointing' ? 'point'
      : trackedDog?.state === 'retrieving' ? 'retrieve' : 'search';
    if (this.panel && encounter !== this.lastEncounter) {
      this.panel.dataset.encounter = encounter; this.lastEncounter = encounter;
    }
    // A bird on its way to hand holds the hunt open; ending with others down loses them.
    const fetching = dogs.some(dog => dog.carryingBirdId !== null || dog.state === 'retrieving')
      || hunt.birds.some(bird => bird.state === 'downed' && bird.fallPending);
    if (this.endButton) {
      this.endButton.disabled = rise || fetching || !!(hawk && !hawk.canEnd);
      const lost = hunt.birds.filter(bird => bird.state === 'downed' && !bird.fallPending).length;
      const label = lost > 0 ? `End hunt (leaves ${lost} bird${lost === 1 ? '' : 's'})` : 'End hunt';
      if (this.endButton.textContent !== label) this.endButton.textContent = label;
    }
    const shells = this.gun.shellsRemaining();
    const capacity = this.gun.shellCapacity();
    // What the hunter can know depends on the tracking gear: GPS reads out
    // the dog's work and distance, a beeper only says it is on point, a bell
    // says nothing the hunter cannot hear and see.
    const tier = this.hunt.trackingGearTier();
    const trackingGuidance = trackedDog?.state === 'tracking' && tier >= 2
      ? trackingApproachGuidance(dogRange, hunt.areaId, trackedDog.scentStage, trackedDog.waitingForHandler) : null;
    const trackingCue = trackingGuidance?.headline ?? null;
    const phase = hawk ? (hawk.phase === 'fist' ? (trackedDog?.state === 'pointing' ? 'DOG ON POINT · WALK IN FOR THE FLUSH' : trackedDog?.state === 'heel' ? 'HAWK ON FIST · Q SENDS DOG HUNTING' : 'HAWK ON FIST · WORKING COVER') : hawk.phase === 'on-quarry' || hawk.phase === 'settling' ? 'HAWK HAS QUARRY · WALK IN' : hawk.phase === 'picking-up' ? 'PICKING UP ONTO THE FIST' : hawk.phase === 'returning' ? 'HAWK RETURNING' : 'GOSHAWK IN PURSUIT') : this.gun.isReloading()
      ? `RELOADING · ${shells}/${capacity}`
      : rise
        ? `${this.hunt.riseLabel() ?? 'BIRD FLUSH'} · shells ${shells}/${capacity}${shells === 0 ? ' · R RELOAD' : ''}`
      : trackedDog?.state === 'whoa'
        ? touchControlsActive() ? 'WHOA · HUNT ON TO RELEASE' : 'WHOA · X HUNT ON · Q WHISTLE IN'
      : trackedDog?.state === 'seeking'
        ? 'DOG HUNTING DEAD'
      : trackedDog?.state === 'retrieving'
        ? trackedDog.carryingBirdId !== null
          ? 'DOG RETURNING WITH BIRD'
          : 'DOG HUNTING DEAD'
        : trackedDog?.state === 'pointing' && tier >= 1
          ? tier >= 2 ? pointApproachCue(dogRange, this.player.isRunning(), hunt.areaId) : 'BEEPER · DOG ON POINT'
          : trackingCue
            ? trackingCue
          : this.fieldTime < this.deliveryNoticeUntil
            ? 'BIRD BROUGHT TO HAND'
          : shells < capacity
            ? `SHELLS ${shells}/${capacity} · R RELOAD`
          : hunt.doubles > 0
            ? `${hunt.doubles} DOUBLE${hunt.doubles > 1 ? 'S' : ''} · HUNTING`
            : 'HUNTING';
    if (phase !== this.lastPhase) {
      if (this.phase) this.phase.textContent = phase;
      this.lastPhase = phase;
    }

    this.hunt.truckWorld(this.truck);
    const dx = this.truck.x - ctx.camera.position.x;
    const dz = this.truck.z - ctx.camera.position.z;
    const yaw = ctx.camera.rotation.y;
    const bearing = dogRelativeBearing(dx, dz, yaw);
    if (this.locator) {
      const pointing = trackedDog?.state === 'pointing';
      const shown = tier >= 2 || (tier === 1 && pointing);
      if (this.locator.hidden === shown) this.locator.hidden = !shown;
      this.locator.classList.toggle('beeper-only', tier === 1);
    }
    if (trackedDog && this.locator && tier >= 2) {
      const dogBearing = dogRelativeBearing(dogDx, dogDz, yaw);
      const pointing = trackedDog.state === 'pointing';
      this.locator.classList.toggle('on-point', pointing);
      const status = trackedDog.raptorDuty === 'guarding' ? 'DOG GUARDING HAWK' : trackedDog.raptorDuty === 'approaching' ? 'DOG GOING TO HAWK' : dogWorkLabel(trackedDog, hunt.areaId);
      const distance = `${Math.round(dogRange / .9144)} YD`;
      // A continuous GPS bearing gives a useful heading when the dog is behind
      // cover; eight text sectors previously jumped by 45 degrees at a time.
      const angle = Math.round(dogBearing * 180 / Math.PI);
      if (this.dogDirection && angle !== this.lastDogAngle) {
        this.dogDirection.textContent = '↑';
        this.dogDirection.style.transform = `rotate(${angle}deg)`;
        this.lastDogAngle = angle;
      }
      if (this.dogStatus && this.dogStatus.textContent !== status) this.dogStatus.textContent = status;
      if (this.dogDistance && this.dogDistance.textContent !== distance) this.dogDistance.textContent = distance;
    }
    else if (trackedDog && this.locator && tier === 1 && trackedDog.state === 'pointing') {
      this.locator.classList.add('on-point');
      if (this.dogStatus && this.dogStatus.textContent !== 'BEEPER · ON POINT') this.dogStatus.textContent = 'BEEPER · ON POINT';
      if (this.dogDistance && this.dogDistance.textContent !== '') this.dogDistance.textContent = '';
    }
    const truckAngle = Math.round(bearing * 180 / Math.PI);
    const windBearing = dogRelativeBearing(Math.cos(hunt.wind), Math.sin(hunt.wind), yaw);
    const windAngle = Math.round(windBearing * 180 / Math.PI);
    if (this.truckDirection && truckAngle !== this.lastTruckAngle) {
      this.truckDirection.style.transform = `rotate(${truckAngle}deg)`; this.lastTruckAngle = truckAngle;
    }
    if (this.windDirection && windAngle !== this.lastWindAngle) {
      this.windDirection.style.transform = `rotate(${windAngle}deg)`; this.lastWindAngle = windAngle;
    }
    if (this.fieldTime >= this.nextNavigationUpdate) {
      this.nextNavigationUpdate = this.fieldTime + .2;
      const compass = fieldCompassHeading(yaw);
      const heading = `${compass.cardinal} ${String(compass.degrees).padStart(3, '0')}°`;
      if (this.heading && this.heading.textContent !== heading) {
        this.heading.textContent = heading; this.heading.setAttribute('aria-label', `Heading ${heading}`);
      }
      const truckMeters = Math.hypot(dx, dz);
      const yards = Math.round(truckMeters / .9144);
      const truckText = truckMeters < 8 ? 'HERE' : `${yards} YD`;
      const windText = hunt.windStrength.toUpperCase();
      const beacon = `${truckText}/${windText}`;
      if (beacon !== this.lastBeacon) {
        if (this.truckDistance) this.truckDistance.textContent = truckText;
        if (this.windStrength) this.windStrength.textContent = windText;
        this.lastBeacon = beacon;
      }
      if (this.guidance) {
        const touch = touchControlsActive();
        let cue = '';
        if (hawk && !hawk.canEnd) cue = hawk.phase === 'on-quarry' || hawk.phase === 'settling'
          ? 'The dog waits beside the hawk. Walk in and pick up onto the fist.'
          : hawk.phase === 'picking-up' ? 'Let your hawk step onto the glove.'
          : hawk.phase === 'returning' ? 'Let the hawk return before sending the dog hunting.'
          : 'The dog is coming to heel. Watch the flight, or recall your hawk.';
        else if (hawk && trackedDog?.state === 'pointing') cue = 'Walk toward the point. Follow the dog’s nose, then face the rise and offer a slip.';
        else if (!rise && trackedDog?.state === 'pointing' && hunt.areaId === 'pheasant-coverts')
          cue = pheasantPointGuidance(dogRange, trackedDog.heading);
        else if (!rise && trackingGuidance) cue = trackingGuidance.detail;
        else if (!rise && trackedDog?.searchAreaChecked && (trackedDog.state === 'recalled' || trackedDog.state === 'heel'))
          cue = 'Nearby ground checked. Walk toward fresh cover to continue the search.';
        else if (!rise && trackedDog?.state === 'heel') cue = touch ? 'Whistle again, or Dog ▸ Hunt on, to send the dog hunting.' : 'Whistle again (or X) to send the dog hunting · C casts it the way you face.';
        else if (!rise && trackedDog?.state === 'pointing' && !trackedDog.steadied) cue = touch ? 'Whoa steadies the dog on point · Dog ▸ Hunt on sends it in to relocate.' : 'Z steadies the dog on point · X sends it in to relocate.';
        if (!rise && trackedDog?.state === 'quartering') {
          if (this.fieldTime < 35) cue = fieldSearchGuidance(hunt.areaId);
          else if (truckMeters < 14) cue = `${this.hunt.dropPoint().name} · back at the truck`;
          else if (this.mainLandmark) {
            const lx = this.mainLandmark.x - ctx.camera.position.x, lz = this.mainLandmark.z - ctx.camera.position.z;
            const distance = Math.hypot(lx, lz);
            const relative = dogRelativeBearing(lx, lz, yaw);
            if (distance < 45) cue = `Near ${this.mainLandmark.name}`;
            else if (distance < 300 && Math.abs(relative) < .5) cue = `${this.mainLandmark.name} · ${Math.round(distance / .9144)} yd ahead`;
          }
        }
        if (this.guidance.textContent !== cue) this.guidance.textContent = cue;
      }
    }

    const complete = huntComplete(hunt) && !rise && (!hawk || hawk.canEnd);
    if (complete && !this.summaryShown) {
      this.summaryShown = true;
      const careerResult = this.hunt.settleCareer();
      this.seasonEnded = careerResult?.seasonEnded ?? false;
      const again = document.getElementById('hunt-again');
      if (again) again.hidden = this.seasonEnded;
      const menu = document.getElementById('hunt-menu');
      if (menu && this.seasonEnded) menu.textContent = 'Return home';
      if (document.pointerLockElement) void document.exitPointerLock();
      if (this.summaryCopy) {
        const dogWork = hunt.dogWork.slice(0, this.hunt.dogCount());
        const pointFlushes = dogWork.reduce((sum, work) => sum + work.pointFlushes, 0);
        if (hawk) {
          const title=this.summary?.querySelector('h2'); if(title)title.textContent='Falconry field notes';
          this.summaryCopy.textContent=`Flights ${hawk.flights} · Catches ${hawk.catches} · Recovered ${hawk.recovered} · Unsuccessful flights ${hawk.misses} · Recalls ${hawk.recalls} · Points held ${pointFlushes}`;
        } else {
          const title = this.summary?.querySelector('h2');
          if (title) title.textContent = 'Field notes';
          renderFieldNotes(this.summaryCopy, hunt, this.hunt.dogCount(), this.fieldTime,
            this.hunt.areaConfig().name, this.hunt.dropPoint().name, careerResult,
            Array.from({ length: this.hunt.dogCount() }, (_, slot) => this.hunt.dogName(slot)));
        }
      }
      if (this.summary) this.summary.hidden = false;
      ctx.events.dispatchEvent(new Event('hunt-complete'));
    }
  }
  dispose(): void {
    this.abort.abort();
    this.fieldIdentity?.remove(); this.fieldMethod?.remove(); this.guidance?.remove();
  }
}
