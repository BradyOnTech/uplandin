import type { DogState } from '../game/dog';

/** One observable dog drives the bearing, work headline and optional guidance.
 * A held point is the urgent approach opportunity; otherwise follow the bird
 * coming to hand before a separate fall search. Ties retain kennel order. */
export function focusedFieldDog<T extends { state: DogState; carryingBirdId: number | null }>(dogs: readonly T[]): T | undefined {
  return dogs.find(dog => dog.state === 'pointing')
    ?? dogs.find(dog => dog.state === 'retrieving' && dog.carryingBirdId !== null)
    ?? dogs.find(dog => dog.state === 'retrieving')
    ?? dogs[0];
}
