export const HUNT_CHALLENGE_KEY = 'uplandin.3d.hunt-challenge.v1';
export const HUNT_CHALLENGES = {
  relaxed: { label: 'Relaxed', description: 'More birds, longer-held points and closer quiet approaches.', stocking: 1.6, nerve: 1.35, approach: .85, spacing: 1 },
  balanced: { label: 'Balanced', description: 'Work the cover and approach quietly. Birds can still surprise you.', stocking: 1, nerve: 1, approach: 1, spacing: 1 },
  wild: { label: 'Wild', description: 'Fewer birds and wary coveys. Give the dog room and be ready sooner.', stocking: .85, nerve: .8, approach: 1.2, spacing: 1 },
  // A put-and-take preserve day: fast action for a short session. Coveys
  // sit close together along every route and hold well for the dog.
  loaded: { label: 'Loaded field', description: 'A preserve day. Birds in every piece of cover and points one after another.', stocking: 4, nerve: 1.6, approach: .8, spacing: .36 },
} as const;
export type HuntChallenge = keyof typeof HUNT_CHALLENGES;
export function parseHuntChallenge(value: string | null | undefined): HuntChallenge {
  return value === 'relaxed' || value === 'wild' || value === 'loaded' ? value : 'balanced';
}
