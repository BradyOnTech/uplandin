import { huntComplete } from '../../game/state';
import { nextHuntUrl } from '../../game/huntSeed';
import { huntingDoctrine } from '../../game/huntDoctrine';
import { renderFieldNotes } from '../fieldNotes';
import { dogRelativeBearing, dogWorkLabel, fieldCompassHeading, fieldSearchGuidance, pointApproachCue, pheasantPointGuidance, trackingApproachGuidance } from '../dogLocator';
import type { Ctx, Subsystem } from '../engine';
import type { BirdsSystem } from './birds';
import type { GunSystem } from './gun';
import type { Hunt3DSystem } from './hunt3d';
import type { PlayerSystem } from './player';

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
  private lastTally = '';
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
      this.fieldMethod.setAttribute('aria-label', `Hunting method: ${doctrine.method}`);
      const methodLabel = document.createElement('span');
      methodLabel.className = 'field-method-label'; methodLabel.textContent = 'METHOD';
      const methodCopy = document.createElement('span');
      methodCopy.className = 'field-method-copy'; methodCopy.textContent = doctrine.method;
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
    document.getElementById('hunt-again')?.addEventListener('click', () => {
      if (['quail-fields', 'pheasant-coverts'].includes(this.hunt.huntState().areaId)) location.assign(nextHuntUrl(location.href));
      else location.reload();
    }, options);
    document.getElementById('hunt-menu')?.addEventListener('click', () => location.assign('./index.html'), options);
    document.getElementById('field-menu')?.addEventListener('click', () => location.assign('./index.html'), options);
    this.endButton?.addEventListener('click', () => {
      if (!this.birds.isRiseActive()) this.hunt.endHunt();
    }, options);
  }

  update(ctx: Ctx, dt: number): void {
    if (this.frozen) return;
    this.fieldTime += dt;
    const hunt = this.hunt.huntState();
    let downOnGround = 0;
    let retrieved = 0;
    for (const bird of hunt.birds) {
      if (bird.state === 'downed' || bird.state === 'carried') downOnGround++;
      else if (bird.state === 'retrieved') retrieved++;
    }

    const tally = `Bag ${retrieved} · Down ${downOnGround} · Shells ${this.gun.shellsRemaining()}/${this.gun.shellCapacity()}`;
    if (tally !== this.lastTally) {
      if (this.tally) this.tally.textContent = tally;
      this.lastTally = tally;
    }

    const dogs = Array.from({ length: this.hunt.dogCount() }, (_, slot) => this.hunt.dog(slot));
    const trackedDog = dogs.find(dog => dog.state === 'pointing') ?? dogs[0];
    if (trackedDog) this.hunt.simToWorld(trackedDog.pos.x, trackedDog.pos.y, this.dogWorld);
    const dogDx = this.dogWorld.x - ctx.camera.position.x;
    const dogDz = this.dogWorld.z - ctx.camera.position.z;
    const dogRange = Math.hypot(dogDx, dogDz);
    const rise = this.birds.isRiseActive();
    const encounter = rise ? 'rise' : trackedDog?.state === 'pointing' ? 'point'
      : dogs.some(dog => dog.state === 'retrieving') ? 'retrieve' : 'search';
    if (this.panel && encounter !== this.lastEncounter) {
      this.panel.dataset.encounter = encounter; this.lastEncounter = encounter;
    }
    if (this.endButton) this.endButton.disabled = rise || downOnGround > 0;
    const shells = this.gun.shellsRemaining();
    const capacity = this.gun.shellCapacity();
    const trackingGuidance = trackedDog?.state === 'tracking'
      ? trackingApproachGuidance(dogRange, hunt.areaId, trackedDog.scentStage, trackedDog.waitingForHandler) : null;
    const trackingCue = trackingGuidance?.headline ?? null;
    const phase = this.gun.isReloading()
      ? `RELOADING · ${shells}/${capacity}`
      : rise
        ? `${this.hunt.riseLabel() ?? 'BIRD FLUSH'} · shells ${shells}/${capacity}${shells === 0 ? ' · R RELOAD' : ''}`
      : dogs.some((candidate) => candidate.state === 'retrieving')
        ? dogs.some((candidate) => candidate.carryingBirdId !== null)
          ? 'DOG RETURNING WITH BIRD'
          : 'DOG HUNTING DEAD'
        : dogs.some((candidate) => candidate.state === 'pointing')
          ? pointApproachCue(dogRange, this.player.isRunning(), hunt.areaId)
          : trackingCue
            ? trackingCue
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
    if (trackedDog && this.locator) {
      const dogBearing = dogRelativeBearing(dogDx, dogDz, yaw);
      const pointing = trackedDog.state === 'pointing';
      this.locator.classList.toggle('on-point', pointing);
      const status = dogWorkLabel(trackedDog, hunt.areaId);
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
        let cue = '';
        if (!rise && trackedDog?.state === 'pointing' && hunt.areaId === 'pheasant-coverts')
          cue = pheasantPointGuidance(dogRange, trackedDog.heading);
        else if (!rise && trackingGuidance) cue = trackingGuidance.detail;
        else if (!rise && trackedDog?.state === 'heel') cue = 'Whistle again to send the dog hunting.';
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

    const complete = huntComplete(hunt) && !rise;
    if (complete && !this.summaryShown) {
      this.summaryShown = true;
      const careerResult = this.hunt.settleCareer();
      if (document.pointerLockElement) void document.exitPointerLock();
      if (this.summaryCopy) {
        const dogWork = hunt.dogWork.slice(0, this.hunt.dogCount());
        const pointFlushes = dogWork.reduce((sum, work) => sum + work.pointFlushes, 0);
        const total = hunt.birds.length;
        const base =
          (hunt.areaId === 'quail-fields'
            ? `${retrieved} retrieved · ${hunt.downed} downed · ${hunt.escaped} escaped`
            : `${hunt.downed} of ${total} down · ${retrieved} retrieved · ${hunt.escaped} lost`) +
          `${hunt.doubles > 0 ? ` · ${hunt.doubles} double${hunt.doubles > 1 ? 's' : ''}` : ''}` +
          ` · ${pointFlushes} point${pointFlushes === 1 ? '' : 's'} held`;
        const career = careerResult
          ? ` · ${careerResult.dogAwards.map((award) => `${award.name} +${award.gained} XP`).join(' · ')}` +
            ` · hunter +${careerResult.hunterGained} XP · ${careerResult.weeks} week${careerResult.weeks === 1 ? '' : 's'} passed`
          : '';
        if (hunt.areaId === 'pheasant-coverts') {
          const title = this.summary?.querySelector('h2');
          if (title) title.textContent = 'Field notes';
          renderFieldNotes(this.summaryCopy, hunt, this.hunt.dogCount(), this.fieldTime,
            this.hunt.areaConfig().name, this.hunt.dropPoint().name, career);
        } else this.summaryCopy.textContent = base + career;
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
