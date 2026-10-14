// Generates the timer beeps in assets/sounds as small 16-bit mono WAV files.
// Run: node scripts/generate-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 22050;

function tone(freq, ms, volume = 0.6) {
  const n = Math.round((RATE * ms) / 1000);
  const fade = Math.round(RATE * 0.005);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / fade, (n - i) / fade);
    samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / RATE) * env * volume * 32767);
  }
  return samples;
}

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  Buffer.from(samples.buffer).copy(buf, 44);
  return buf;
}

const out = new URL('../assets/sounds/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('tick.wav', out), wav(tone(880, 120)));
writeFileSync(new URL('go.wav', out), wav(tone(1320, 450)));
writeFileSync(new URL('rest.wav', out), wav(tone(660, 300)));
console.log('Wrote assets/sounds/{tick,go,rest}.wav');
