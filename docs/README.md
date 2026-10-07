# Uplandin docs

This folder is the project's working memory. Most of it was written during
development: specs before work, evidence after it. Start with the documents below.
They explain how the game works and why it is built this way.

## Start here

| Doc | What it covers |
|---|---|
| [DESIGN.md](DESIGN.md) | The living game spec, organized by tranche (T0–T7): what was planned, what shipped, and the design rules behind it. |
| [TUNING.md](TUNING.md) | Every gameplay value, where it lives, and what it does, including a step-by-step walk through the flush pipeline. |
| [../ARCHITECTURE-3D.md](../ARCHITECTURE-3D.md) | The engine contract: how the Three.js presentation consumes the shared hunt simulation. |
| [3d/shared-hunt-simulation-plan.md](3d/shared-hunt-simulation-plan.md) | How one engine-free simulation came to drive both the Phaser and Three.js renderers. |
| [3d/handling-and-field-craft.md](3d/handling-and-field-craft.md) | Dog handling commands (whoa, cast, dead bird, recall) and the field-craft rules they interact with. |
| [3d/hunting-doctrine.md](3d/hunting-doctrine.md) | The real-world tactics each ground rewards, and how they map onto mechanics. |
| [3d/training-grounds.md](3d/training-grounds.md) | The ten drills and how career practice develops individual dog abilities. |
| [deployment.md](deployment.md) | Cloudflare deploys, versioning, release notes, and rollback. |
| [3d/offline-preservation.md](3d/offline-preservation.md) | The offline/PWA update model and how it was verified. |
| [3d/mobile-performance.md](3d/mobile-performance.md) | Quality tiers, frame-time capture, and phone performance work. |

## Everything else

The other files are dated working notes from AI-agent sessions: plans,
checkpoints, review notes, and art direction, plus `3d/shots/` (headless
captures from the real renderer) and `art/` (2D art studies). I've kept them as a
paper trail of how features were specified, built, and verified. Expect
them to describe the state of the game on the day they were written.
