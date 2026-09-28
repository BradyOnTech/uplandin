# Sharptail western field rebuild

**Scope**

This checkpoint rebuilds the western prairie assets and their composition. It is a playable art iteration; it does not establish final art approval for Sharptail or the other maps.

- Curved bunchgrass leaves replace the stiff common grass geometry. Distributed crowns, stronger face lighting, varied height and darker litter give the close sward more body.
- Fractured, closed erratics replace radial domes. Two smaller foreground stones extend the western group; body collision covers their footprints and the meshes obstruct shots.
- Open branches and folded leaf sprays replace solid shrub lumps. Existing western draw roots gather into larger, separated silver sage colonies.
- Two distinct exterior ridgelines leave a continuous low valley between them. Drainage paint follows the actual slopes. The hunting surface and its 24-yard exterior collar remain unchanged by the horizon work.
- A generated four-cloud atlas supplies painted silhouettes through the existing sky dome. Time-of-day colors remain dynamic, loading is optional, and the texture is disposed with the scene. Source image and generation prompt are retained under `assets/source/sharptail-kit/`.
- The offline asset list includes the current meadow, granite and cloud textures.

**Verification**

The full suite passes: 1,377 tests across 176 files. TypeScript and the production build pass. Fifty-four GPU grass checks retain local dog contact while leaving distant grass alone.

Desktop Chrome review covers four ordinary-height positions on High and Lightweight, plus a live walk from West Track using W/Shift. Camera direction was adjusted for review; the live walk did not teleport the player or advance the hunt artificially. These are visual and traversal checks, not a completed hunt or a phone performance benchmark.

Evidence is under `output/sharptail-west-outlook/`: `rebuilt-production/` contains staged comparisons, `walk-high/` contains the live walk, and `rebuilt-grass-contact/` contains the GPU regression. Paused staged views retain stale HUD labels; their camera telemetry records the reviewed positions.

The cloud download is 231,740 bytes and its decoded mip chain is approximately 8 MB. Shrub geometry is more expensive although instance and batch counts stay unchanged. Across the four comparable views, submitted triangles increase 8–11% on High and 14–18% on Lightweight versus the preceding checkpoint. Real phone frame time still needs measurement.

**Further art work**

The distant sward still relies heavily on terrain shading. Wider prairie views need more composed middle-distance features, and vegetation transitions should receive another movement review before calling the whole property finished. Keep future work tied to ordinary hunting views and preserve distinct open-prairie strategy.
