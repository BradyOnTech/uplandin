/** Timestamp-preserving browser recorder. CDP JPEG frames are captured without
 * blocking input; offline encoding uses their actual durations. Explicitly
 * scaled video includes the whole page/UI and never alters gameplay. Audio is
 * opt-in and supplied by the passive pre-navigation WebAudio observer. */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export async function startBrowserRecording(page, path, { width = 1280, height = 720, fps = 30, audioCapture = null } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'quail-record-'));
  const frames = [];
  const client = await page.createCDPSession();
  let lastAccepted = -Infinity;
  let lastWallTime = performance.now();
  let stopped = false;
  const handler = (event) => {
    void client.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    if (stopped || !Number.isFinite(event.metadata.timestamp)) return;
    const stamp = event.metadata.timestamp;
    // Bound encoding cost while preserving each retained frame's true time.
    if (stamp - lastAccepted < 1 / fps) return;
    const file = join(directory, `${String(frames.length).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(event.data, 'base64'));
    frames.push({ file, stamp });
    lastAccepted = stamp;
    lastWallTime = performance.now();
  };
  client.on('Page.screencastFrame', handler);
  if (audioCapture) await audioCapture.start();
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  return {
    async stop() {
      const stoppedAt = performance.now();
      const audioSegments = audioCapture ? await audioCapture.stop() : [];
      stopped = true;
      await client.send('Page.stopScreencast');
      client.off('Page.screencastFrame', handler);
      await client.detach();
      if (frames.length === 0) throw new Error(`Recording has no frames; scratch ${directory}`);
      const rows = [];
      const duration = frames.at(-1).stamp - frames[0].stamp + Math.max(1 / fps, (stoppedAt - lastWallTime) / 1000);
      frames.forEach((frame, i) => {
        rows.push(`file '${frame.file}'`);
        rows.push(`duration ${Math.max(.001, i < frames.length - 1 ? frames[i + 1].stamp - frame.stamp : (stoppedAt - lastWallTime) / 1000)}`);
      });
      rows.push(`file '${frames.at(-1).file}'`);
      const concat = join(directory, 'frames.txt');
      writeFileSync(concat, rows.join('\n'));
      // libx264 ultrafast makes recording practical alongside Blender work.
      // CFR resampling preserves elapsed time; it does not accelerate action.
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concat];
      const audioTiming = [];
      if (audioSegments.length) {
        const filters = [];
        audioSegments.forEach((segment, i) => {
          args.push('-i', segment.file);
          const offsetSeconds = segment.startedEpochMs / 1000 - frames[0].stamp;
          audioTiming.push({ ...segment, file: undefined, offsetSeconds });
          filters.push(`[${i + 1}:a]atrim=start=${Math.max(0, -offsetSeconds).toFixed(6)},asetpts=PTS-STARTPTS,adelay=${Math.max(0, offsetSeconds * 1000).toFixed(3)}:all=1[a${i}]`);
        });
        filters.push(`${audioSegments.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audioSegments.length}:duration=longest:normalize=0,apad,atrim=duration=${duration.toFixed(6)}[mix]`);
        args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:a', 'aac', '-b:a', '160k');
      } else args.push('-an');
      args.push('-vf', `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, '-c:v', 'libx264', '-preset', 'ultrafast',
        '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path);
      await new Promise((done, reject) => {
        const encoder = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let error = '';
        encoder.stderr.on('data', (chunk) => { error += chunk; });
        encoder.on('error', reject);
        encoder.on('close', (code) => code === 0 ? done() : reject(new Error(`Video encoding failed (${code}): ${error}; frames ${directory}`)));
      });
      let audioStream;
      if (audioCapture) {
        const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
          'stream=codec_name,sample_rate,channels,duration', '-of', 'json', path], { encoding: 'utf8' });
        audioStream = probe.status === 0 ? JSON.parse(probe.stdout).streams?.[0] : null;
        if (!audioStream || !(Number(audioStream.duration) > 0)) throw new Error(`Muxed video has no valid audio stream: ${probe.stderr}`);
        audioCapture.cleanup();
      }
      rmSync(directory, { recursive: true });
      return { frames: frames.length, durationSeconds: duration, fps, width, height,
        firstFrameEpochMs: frames[0].stamp * 1000,
        timing: 'CDP frame timestamps with elapsed-time-preserving CFR resampling', audio: !!audioCapture,
        ...(audioCapture ? { audioStream, audioSegments: audioTiming,
          audioTiming: 'MediaRecorder start performance.timeOrigin+performance.now aligned to first CDP frame epoch; independent document segments retain navigation gaps. Encoder and hardware latency are reported, not sample-perfect synchronization.' } : {}) };
    },
  };
}
