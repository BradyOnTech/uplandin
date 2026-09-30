# Handling and field craft

**September 29, 2026**

The dog is the game, so the handler now has more to say to it, more reasons to say it, and a report afterwards on how it went. Everything below lives in the shared hunt simulation (`src/game/dog.ts`, `src/game/huntSimulation.ts`). The 3D field supplies the input and the presentation.

## Commands

| Key | Touch | Command | What the dog does |
|---|---|---|---|
| Q | Whistle | Whistle | Comes in to heel. At heel, whistling again sends it hunting. (Unchanged.) |
| Z | Whoa | Whoa | A hunting, tracking or **breaking** dog stops where it stands (`whoa` state) until released or whistled in. On point or backing, it is **steadied**: no more creeping, and its break odds at the flush drop to 35% (`STEADIED_BREAK_MULT`). |
| X | Dog ▸ Hunt on | Hunt on | Releases a whoa'd, marking or heeled dog. On point, it **relocates**: breaks the point and roads in on the bird wherever it has gone. |
| C | Dog ▸ This way | Cast | Drives the dog 30 m out along the way you face. For 25 s (`CAST_COMMAND_MS`) it works that ground as its centre. |
| V | Dog ▸ Dead bird | Hunt dead | Sends the dog to where you are looking. It works outward in widening, nose-down circles for 22 s (`SEEK_COMMAND_MS`) and fetches any fall it winds. |

- **Hearing:** commands carry only as far as the whistle. GPS + map gear carries any distance.
- **Retrieves:** a retrieve is never interrupted.
- **Feedback:** every command gets a line on screen ("Whoa · Sage steady on point", "Sage can't hear you · get closer").

## Falls, cripples and lost birds

- **Marked falls:** a dog knows a fall only if it saw it. That means it was marking the rise, or the bird came down within 45 yd (22 yd in the cattails) of a dog that was not chasing or already fetching.
- **Unmarked falls:** the dog finds these only by winding them (dead-bird scent is 30% of live-bird scent), or when you send it with Dead bird.
- **Wounded birds:** a hit on the outer fringe of the pattern (beyond 78% of its radius), or beyond 44 m, lands wounded. It runs from the nearest dog or hunter at 1.3 m/s for 7 s, then tucks in.
- **Chasing a runner:** the dog goes to the mark first and follows its nose from there. If the bird is gone, it circles the mark for 14 s. If that fails, the bird is lost to anything but scent.
- **Ending the hunt:** you can end with birds still down (the button says how many). They count as lost.

## Safe shooting

When you fire, the gun checks two things:

- **Dog in the line:** a dog within about 2 m of the shot line inside its range.
- **Low shot:** the shot passes within 1.1 m of the ground 12–32 m out.

Either one calls out at once, is recorded in `hunt.safety`, and costs hunter XP (low 2, dog in line 5). Each lost bird costs 2.

## Reading the dog at a distance

- **Smooth and faceted dogs:** a merry, wide tail while searching. On first scent the head snaps up and the tail stops dead. While locating, the tail rises and feathers fast. Stalking is low with a rigid, high tail. Whoa stands square with the head up. Hunting dead is nose down.
- **The bell:** it follows the work. It rings busily at the run, breaks up to a slower ring while locating, gives a rare tinkle while stalking, and goes silent when the dog stops (`dogBellInterval`).

## After the hunt

The field notes carry a report for each dog (`src/game/dogReport.ts`):

- **Numbers:** points, points held to the flush and retrieves, plus backs, breaks and bumps when there were any.
- **Notes:** up to three plain notes, with the habit to fix first ("Broke and chased twice. Whoa (Z) on point steadies it.").
- **Hunter notes:** lost birds and unsafe shots.
- **Journal:** career hunts record each dog's first note, and the lost and unsafe counts.
- **Dog XP:** relocating a runner or finding an unmarked fall now earns it.

## Pheasant search (Cattail Coverts)

The pheasant dog now drops a cover beat once the walking handler has left it behind. It also weighs beats out in front of the gun more heavily (`laneCost` without slack at weight 3.2).

With a handler walking a public trail at 1.5 m/s for three minutes, without birds:

| Breed | Ahead of handler | Behind by more than 5 m |
|---|---|---|
| GSP | 57% → 82% | 12% → 5% |
| Setter | 53% → 74% | 17% → 8% |

`test/fieldQuartering.test.ts` now covers pheasant too. The other three properties are unchanged.

## Measuring on your own devices

All verification so far is headless, with software WebGL. To measure real frame times:

1. Run `npm run play:mobile`.
2. Open the printed network address on the phone, or `http://localhost:4593` on the Mac. Go to a field URL with `&diagnostics=1`, for example `index3d.html?area=quail-fields&drop=south-gate&breed=gsp&quality=auto&diagnostics=1`.
3. On the arrival card, open the **Settings** tab, expand **Performance capture** and press **Start capture and play**. Hunt for a couple of minutes.
4. Pause (or finish the hunt) and press **Save report**. The JSON has frame-time percentiles, device details and the route.
