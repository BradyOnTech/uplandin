# Training Grounds

Open `/training3d.html` from the home menu or **Train this dog** in career
preparation. Practice uses the existing Quail Fields landscape, generated dog
models, bird flight rig, movement, scent, commands, and retrieval simulation.
New 3D objects are small course stakes and an orange bumper made from primitives;
the pigeon uses the existing bird rig with a gray palette and adjusted silhouette.

## Lessons

| Lesson | Player's work | Abilities developed |
| --- | --- | --- |
| Planted birds | Work cover, establish a point, steady the dog, walk in quietly | Scent, steadiness |
| Marked retrieve | Throw, wait for the bumper to land, send, stay still for delivery | Retrieving, steadiness |
| Hunt dead | Direct the dog toward a bumper hidden in cover | Scent, retrieving |
| Quartering course | Face and cast toward each marked piece of cover; follow the dog | Handling, scent |
| Whoa and release | Stop the dog, walk away, hold through a pigeon distraction, release | Steadiness, handling |
| Recall to heel | Let the dog work out, recall, wait at heel, release | Handling |
| Honor a point | Back a finished mentor for five seconds; Whoa can support a young dog | Steadiness, handling |
| Runner relocation | Release from the first point after the rooster moves; produce a fresh point | Scent, steadiness |
| Conditioning circuit | Walk the gates with the dog and rest five seconds at heel | Conditioning, handling |
| Mixed field trial | Two planted birds, one marked retrieve, one hidden bumper | Scent, steadiness, retrieving, handling |

Lessons have three repetitions; the mixed trial has four. Difficulty changes
distance and advanced bird patience. Cover selects existing smaller or larger
patches. Wind strength and the course seed are selectable. Training is staged
outside the truck safety zones, in morning light with a favorable wind direction.

## Controls and scoring

Use ordinary movement and dog commands: **WASD** walk, **Q** recall, **Z** Whoa,
**X** Hunt on, **C** cast where you face, **V** hunt dead where you look.
**E** throws, sends, or starts the next repetition, as shown by the drill panel.
On touch, use Whoa, Whistle, the Dog tray, and the drill's action button.
The instruction and marker bearing update as the lesson progresses.

The shared simulation must actually point, hold, pick up, and deliver. Clean
work carries most of the score; slow completed repetitions lose at most eight
points. Bumping, creeping, breaking, and sending before the fall cost points.
Gold requires 90, Silver 75, Bronze 60, and all repetitions completed. Partial
practice can develop skills but earns no medal. End training is available at
any time, including during a retrieve.

## Career development

Breed ratings are maximum potential. Current ability is shown against that
potential in preparation and training results. The five skills progress
independently, with a cap of 180 XP each. Scent affects nose and wind work;
steadiness affects point and flush manners; retrieving affects search and
pickup; handling affects range; conditioning affects pace and endurance.
Age continues to affect physical performance separately.

Training shares a per-dog, per-career-week budget across every lesson:
**16 skill XP and 8 dog XP**. Breed learning rates apply within those budgets.
Repeating is always allowed; hunt or advance to another week for a new budget.
Practice does not advance the calendar, award hunter XP, record a hunt or bag,
or consume the first wild-point milestone. Real hunts also develop the skills
used during that outing. General level-ups alone do not fill unrelated skills.

Existing saves initialize skill progress from each dog's prior level, preserving
their established behavior curves. Session settlement is idempotent and checks
the latest save, selected dog's retirement, and the career date before crediting.
Quick challenges use a temporary dog preset and separate local personal records;
they leave career and ordinary Quick Hunt setup unchanged. Personal bests compare
the same drill, difficulty, cover, wind, seed, breed, and ability preset.

## Implementation and validation

- `src/game/training.ts` owns seeded lessons, observation, scoring, records, and
  career settlement; `dogDevelopment.ts` owns independent ability progression.
- `TrainingGroundSystem` presents instructions, stakes, and bumpers. The normal
  generated dog renderer supplies mouth attachment, pickup, and visual attention.
- Pure integration tests exercise all ten lessons with normal commands and the
  real dog AI, including puppies, delayed sends, and advanced heavy-cover work.
- Browser playtesting completed a three-repetition Quick retrieve with keyboard
  controls and a new career puppy's three-repetition retrieve with touch buttons.
  The career payout preserved the calendar, hunter XP, hunt count, and Quick save.
- Phone layouts are checked in browser emulation. Physical-device feel and
  balancing across a long career still benefit from player testing.
