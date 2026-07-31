# Quail Fields — Director guide (you don’t need to be an artist)

This is the process for a **fixed Quail Field**: same place every hunt, birds
randomize among cover patches. You approve the look; code holds numbers.

## What we built

| Piece | Where | Your job |
|--------|--------|----------|
| Grass plate | `public/art/plate-southern-plains-open.png` | “Too busy / too dark?” |
| Props (mockup crops) | `public/art/mockup-field-props.png` | “Oaks look wrong?” |
| Cover beds (mockup crops) | `public/art/mockup-cover-beds.png` | “Beds too purple/boxy?” |
| Placement list | `src/game/fieldLayouts.ts` | Move x/y/scale |
| Cover sim (dog AI) | `src/game/areas.ts` `quail-fields.patches` | Don’t touch unless redesigning cover |
| Birds | `spawnBirds` | Already random each hunt |

**Prop frames** (72×72 sheet):

| Frame | What |
|-------|------|
| 0–1 | Bur oaks (from mockup) |
| 2 | Russet shrub |
| 3 | Olive shrub |
| 4–5 | Cattail props (optional landmarks) |

**Cover bed frames** (80×64): 0–3 = cattail beds from mockup.

---

## Your loop (10 minutes)

1. **Play** Quail Fields (hard-reload so art caches clear: Cmd+Shift+R).
2. **Walk** the whole field. Note only 2–3 problems max, e.g.:
   - “Oak at top-left too close to center”
   - “Too many cover beds — field feels crowded”
   - “Russet shrub looks tiny”
3. **Edit** `src/game/fieldLayouts.ts` → `AUTHORED_LAYOUTS['quail-fields']`:
   - Change `x`, `y`, `scale` on a prop or bed
   - Delete a line to remove something
   - Copy a line to add another oak (use frame 0 or 1)
4. **Reload** and re-check.
5. Stop when it *feels* like a place, not when it’s pixel-perfect.

### Example edits

```ts
// Move an oak right and make it bigger
{ frame: 0, x: 220, y: 120, scale: 1.5 },

// Remove a cover bed: delete its line from coverBeds

// Flip a tree
{ frame: 1, x: 920, y: 130, scale: 1.45, flipX: true },
```

World size is **1200×700**. Origin is top-left. Prop origin is **feet** (bottom center).

---

## If the *sprites* themselves look bad (not placement)

You still don’t need freehand art:

1. Open `docs/art/field-view-mockup.png` in any image app.
2. Crop a better oak or cattail region.
3. Tell the agent: *“Replace mockup prop frame 0 with this crop”*  
   (or drop the crop in `docs/art/` and ask to re-key + fit into the sheet).
4. Freeze — don’t keep regenerating forever.

Optional free tools if you want to try keying once:
- [LibreSprite](https://libresprite.github.io/) or Aseprite trial  
- Magic wand select tan background → delete → export PNG with alpha

---

## What stays random each hunt (on purpose)

- Which patches hold birds  
- Wind / conditions / dog path  
- Not the trees, not the cover bed positions  

That’s “known covert, unknown birds.”

---

## Checklist for “good enough”

- [ ] Open grass is continuous (not Minecraft tiles)
- [ ] A few **large** oaks with trunks, not 30 berry balls
- [ ] Cover is **distinct beds**, not green rain / purple mush
- [ ] White dog readable on open lanes
- [ ] Field looks the **same** every visit
- [ ] Birds still appear in **different** cover across hunts

---

## Next areas later

Only after Quail Fields passes your checklist: copy the pattern for another area
(`AUTHORED_LAYOUTS['pheasant-coverts']` etc.). Don’t proceduralize SP again.
