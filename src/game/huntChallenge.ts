export const HUNT_CHALLENGE_KEY = 'uplandin.3d.hunt-challenge.v1';
export const HUNT_CHALLENGES = {
  relaxed: { label: 'Relaxed', description: 'More birds, longer-held points and closer quiet approaches.', stocking: 1.6, nerve: 1.35, approach: .85 },
  balanced: { label: 'Balanced', description: 'Work the cover and approach quietly. Birds can still surprise you.', stocking: 1, nerve: 1, approach: 1 },
  wild: { label: 'Wild', description: 'Fewer birds and wary coveys. Give the dog room and be ready sooner.', stocking: .85, nerve: .8, approach: 1.2 },
} as const;
export type HuntChallenge = keyof typeof HUNT_CHALLENGES;
export function parseHuntChallenge(value: string | null | undefined): HuntChallenge {
  return value === 'relaxed' || value === 'wild' ? value : 'balanced';
}
