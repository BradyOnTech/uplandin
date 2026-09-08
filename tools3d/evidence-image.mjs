/** Reject interrupted boots and uniform canvas output; this is a failure guard,
 * not a visual-quality oracle. Measurements use a detached image canvas. */
export async function verifyEvidenceImage(page, png, bootToken) {
  const result = await page.evaluate(async (base64, expected) => {
    if (!window.__ready3d || window.__evidenceBootToken !== expected) throw new Error('Page rebooted during capture');
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 45;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const sum = [0, 0, 0], square = [0, 0, 0]; let count = 0;
    for (let y = 5; y < 40; y++) for (let x = 8; x < 72; x++) {
      const offset = (y * 80 + x) * 4;
      for (let channel = 0; channel < 3; channel++) { const v = pixels[offset + channel]; sum[channel] += v; square[channel] += v * v; }
      count++;
    }
    const channelStdDev = sum.map((value, i) => Math.sqrt(Math.max(0, square[i] / count - (value / count) ** 2)));
    if (Math.max(...channelStdDev) < 2.5) throw new Error('Capture center is effectively uniform; render evidence is missing');
    if (!window.__ready3d || window.__evidenceBootToken !== expected) throw new Error('Page rebooted during image validation');
    return { channelStdDev, samples: count, scope: 'center80percent, coarseRGBvariation' };
  }, Buffer.from(png).toString('base64'), bootToken);
  return result;
}
