import { developedStats, DOG_SKILLS, readDevelopment, skillFraction, skillGainText, SKILL_LABELS } from '../game/dogDevelopment';
import { getBreed } from '../game/breeds';
import type { KennelDog } from '../game/career';
import { recordTraining, trainingRecordId, TRAINING_DRILLS } from '../game/training';
import type { Hunt3DSystem } from './subsystems/hunt3d';

export function renderDogDevelopment(dog: KennelDog): HTMLElement {
  const panel = document.createElement('section'); panel.className = 'dog-development';
  panel.setAttribute('aria-label', `${dog.name} current ability and breed potential`);
  const breed = getBreed(dog.breedId), development = readDevelopment(dog.development, dog.level), current = developedStats(breed, development);
  const title = document.createElement('h3'); title.textContent = 'Ability / breed potential'; panel.append(title);
  const stats = document.createElement('dl'); stats.className = 'training-ability';
  for (const axis of ['nose', 'speed', 'range', 'steadiness', 'stamina'] as const) {
    const row = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
    label.textContent = axis[0].toUpperCase() + axis.slice(1); value.textContent = `${current[axis].toFixed(1)} / ${breed.stats[axis]}`;
    const meter = document.createElement('meter'); meter.min = 0; meter.max = breed.stats[axis]; meter.value = current[axis]; meter.setAttribute('aria-label', label.textContent);
    row.append(label, value, meter); stats.append(row);
  }
  panel.append(stats);
  const skills = document.createElement('p'); skills.className = 'training-skill-summary';
  skills.textContent = DOG_SKILLS.map(key => `${SKILL_LABELS[key]} ${Math.round(skillFraction(development, key) * 100)}%`).join(' · ');
  const help = document.createElement('p'); help.className = 'help'; help.textContent = 'Field work and focused practice develop these abilities. Age affects pace and endurance separately.';
  panel.append(skills, help); return panel;
}

export function renderTrainingResults(container: HTMLElement, hunt: Hunt3DSystem): void {
  const session = hunt.training; if (!session) return;
  const result = session.result(), heading = document.createElement('p'); heading.className = 'training-result-medal';
  heading.textContent = `${result.medal} · ${result.score}/100`;
  const detail = document.createElement('p'); detail.textContent = `${TRAINING_DRILLS[result.config.drill].name} · ${result.seconds} seconds · ${result.rounds.filter(r => r.completed).length}/${session.roundCount} repetitions completed`;
  const overview = document.createElement('section'); overview.className = 'training-results-overview'; overview.append(heading, detail);
  container.replaceChildren(overview);
  if (result.config.mode === 'career') {
    const award = hunt.settleTraining();
    if (award) {
      const message = document.createElement('p'); message.textContent = award.message;
      const gains = document.createElement('p'); gains.textContent = [`${hunt.dogName()} +${award.dogXp} XP · Level ${award.newLevel}`, ...skillGainText(award.gained)].join(' · ');
      const budget = document.createElement('p'); budget.textContent = `${award.remaining.toFixed(1)} skill XP left for this career week.`;
      overview.append(gains, budget); container.append(message);
      const dog = award.career.kennel.find(d => d.id === award.dogId);
      if (dog) { const ability = renderDogDevelopment(dog); ability.classList.add('training-result-development'); container.append(ability); }
    }
  } else {
    let storage: Storage | null = null; try { storage = localStorage; } catch { /* Optional personal records. */ }
    const record = recordTraining(storage, trainingRecordId(result.config, hunt.dog().profile.breed.id, hunt.dog().level), result);
    const best = document.createElement('p'); best.textContent = `${record.improved ? 'Personal best! ' : ''}Best on this course and dog preset: ${record.best.score}/100 · ${record.best.seconds}s · ${record.best.attempts} ${record.best.attempts === 1 ? 'attempt' : 'attempts'}`;
    overview.append(best);
  }
  // Each repetition is a separate pager section, so every note fits on a phone.
  for (const [index, round] of result.rounds.entries()) {
    const row = document.createElement('section'), name = document.createElement('strong'), note = document.createElement('p'); row.className = 'training-result-round';
    name.textContent = `${index + 1}. ${TRAINING_DRILLS[round.drill].name} · ${round.score}/100`; note.textContent = round.note; row.append(name, note); container.append(row);
  }
}
