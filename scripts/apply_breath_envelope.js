#!/usr/bin/env node
// Apply a 10s breathing volume envelope (5s inhale, 5s exhale) to 10s wav files.
// Creates new files with suffix _breath.wav beside originals.
// Assumes 16-bit PCM mono WAV with standard RIFF header.

const fs = require('fs');
const path = require('path');

// Target files (adjust as needed)
const files = [
  'sounds/brown_noise.wav',
  'sounds/nature_bonfire.wav',
  'sounds/nature_rain.wav',
  'sounds/nature_sea.wav'
];

// Breathing envelope: smooth ramp up (inhale) then down (exhale) using cosine easing.
function breathingEnvelope(totalSamples, sampleRate) {
  const duration = totalSamples / sampleRate; // should be 10s
  const inhaleEnd = duration / 2; // 5s
  const envelope = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate; // seconds
    let amp;
    if (t <= inhaleEnd) {
      // Inhale: 0 -> 1 smooth
      const x = t / inhaleEnd; // 0..1
      amp = 0.5 - 0.5 * Math.cos(Math.PI * x); // cosine ease-in
    } else {
      // Exhale: 1 -> 0 smooth
      const x = (t - inhaleEnd) / inhaleEnd; // 0..1
      amp = 0.5 + 0.5 * Math.cos(Math.PI * x); // cosine ease-out
    }
    envelope[i] = amp; // 0..1
  }
  return envelope;
}

function parseWav(buffer) {
  // Basic validation
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }
  // fmt chunk should start at 12
  const fmtIndex = buffer.indexOf('fmt ');
  if (fmtIndex < 0) throw new Error('fmt chunk not found');
  const audioFormat = buffer.readUInt16LE(fmtIndex + 8);
  const numChannels = buffer.readUInt16LE(fmtIndex + 10);
  const sampleRate = buffer.readUInt32LE(fmtIndex + 12);
  const bitsPerSample = buffer.readUInt16LE(fmtIndex + 22);
  if (audioFormat !== 1) throw new Error('Only PCM supported');
  if (numChannels !== 1) throw new Error('Only mono supported');
  if (bitsPerSample !== 16) throw new Error('Only 16-bit supported');
  // Find data chunk
  const dataIndex = buffer.indexOf('data');
  if (dataIndex < 0) throw new Error('data chunk not found');
  const dataSize = buffer.readUInt32LE(dataIndex + 4);
  const dataStart = dataIndex + 8;
  const dataEnd = dataStart + dataSize;
  const dataBuf = buffer.slice(dataStart, dataEnd);
  const sampleCount = dataSize / 2; // 16-bit
  return { sampleRate, samples: dataBuf, sampleCount, header: buffer.slice(0, dataStart) };
}

function applyEnvelopeToSamples(parsed, envelope) {
  const { samples } = parsed;
  const out = Buffer.alloc(samples.length);
  for (let i = 0; i < envelope.length; i++) {
    const sample = samples.readInt16LE(i * 2);
    const scaled = Math.max(-1, Math.min(1, (sample / 32767) * envelope[i]));
    out.writeInt16LE(Math.floor(scaled * 32767), i * 2);
  }
  return out;
}

function processFile(file) {
  if (!fs.existsSync(file)) {
    console.warn(`Skip: ${file} (not found)`);
    return;
  }
  const buffer = fs.readFileSync(file);
  const parsed = parseWav(buffer);
  const envelope = breathingEnvelope(parsed.sampleCount, parsed.sampleRate);
  const processed = applyEnvelopeToSamples(parsed, envelope);
  const newDataSize = processed.length;
  const newFileBuffer = Buffer.concat([parsed.header, processed]);
  // Update overall RIFF size and data chunk size
  // RIFF size at offset 4 (fileSize - 8)
  newFileBuffer.writeUInt32LE(newFileBuffer.length - 8, 4);
  // data chunk size at dataIndex+4
  const dataIndex = newFileBuffer.indexOf('data');
  newFileBuffer.writeUInt32LE(newDataSize, dataIndex + 4);
  const ext = path.extname(file);
  const base = file.slice(0, -ext.length);
  const outPath = `${base}_breath${ext}`;
  fs.writeFileSync(outPath, newFileBuffer);
  console.log(`✓ ${outPath}`);
}

console.log('Applying 10s breathing envelope (5s inhale / 5s exhale)...');
files.forEach(processFile);
console.log('Done.');
