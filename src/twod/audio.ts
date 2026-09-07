/** Small, gesture-unlocked soundscape, scoped to the field adventure. */
export class FieldAudio {
  private context?: AudioContext;
  muted = false;
  async unlock() {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Audio is optional in restricted browsers. */ }
  }
  private tone(frequency: number, duration: number, delay = 0, volume = 0.035, end?: number) {
    const ctx = this.context;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (end) oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
  play(name: string) {
    if (name === 'whistle') { this.tone(1320, 0.17, 0, 0.035, 1540); this.tone(1540, 0.22, 0.2); }
    else if (name === 'point') { this.tone(660, 0.18); this.tone(880, 0.34, 0.12); }
    else if (name === 'hit' || name === 'discovery') { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, i * 0.07)); }
    else if (name === 'bird') { this.tone(1850, 0.1, 0, 0.013, 2400); this.tone(2250, 0.14, 0.16, 0.01, 1650); }
    else if (name === 'click') this.tone(440, 0.08, 0, 0.017);
    else if (name === 'shot' || name === 'flush') {
      const ctx = this.context;
      if (!ctx || this.muted || ctx.state !== 'running') return;
      const length = name === 'shot' ? 0.24 : 0.5;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.18));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = name === 'shot' ? 850 : 1900;
      const gain = ctx.createGain(); gain.gain.value = name === 'shot' ? 0.24 : 0.065;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
      if (name === 'shot') this.tone(120, 0.13, 0, 0.07, 42);
    }
  }
  suspend() { void this.context?.suspend(); }
  destroy() { void this.context?.close(); }
}
