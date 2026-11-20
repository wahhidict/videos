// Minimal WAV (RIFF) parser used to measure real generated voice-over durations.

const RIFF_MAGIC = 0x46464952; // "RIFF" (little-endian read)
const WAVE_MAGIC = 0x45564157; // "WAVE" (little-endian read)

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Returns the audio duration in seconds for a PCM WAV file, or null when the
 * bytes are not a parseable WAV.
 */
export function wavDurationSeconds(bytes: Uint8Array): number | null {
  try {
    if (bytes.length < 44) return null;
    if (readU32(bytes, 0) !== RIFF_MAGIC) return null;
    if (readU32(bytes, 8) !== WAVE_MAGIC) return null;

    let offset = 12;
    let audioFormat = 0;
    let channels = 0;
    let sampleRate = 0;
    let byteRate = 0;
    let dataSize = 0;

    while (offset + 8 <= bytes.length) {
      const chunkId = readU32(bytes, offset);
      const chunkSize = readU32(bytes, offset + 4);
      const body = offset + 8;
      if (chunkId === 0x20746d66) {
        // "fmt "
        audioFormat = readU16(bytes, body);
        channels = readU16(bytes, body + 2);
        sampleRate = readU32(bytes, body + 4);
        byteRate = readU32(bytes, body + 8);
        if (audioFormat === 0xfffe) {
          // WAVE_FORMAT_EXTENSIBLE: SubFormat GUID's first 2 bytes carry the real codec.
          audioFormat = chunkSize >= 26 ? readU16(bytes, body + 24) : 1;
        }
      } else if (chunkId === 0x61746164) {
        // "data"
        dataSize = chunkSize;
        if (dataSize === 0xffffffff || dataSize === 0) {
          dataSize = Math.max(0, bytes.length - body);
        }
      }
      offset = body + chunkSize + (chunkSize % 2);
      if (audioFormat !== 0 && channels !== 0 && sampleRate !== 0 && byteRate !== 0 && dataSize > 0) break;
    }

    if (audioFormat !== 1 && audioFormat !== 3) return null; // PCM only (int/float)
    if (!byteRate || !sampleRate || !channels || !dataSize) return null;
    const seconds = dataSize / byteRate;
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/** Build a raw PCM s16 mono WAV header + samples (used by exporters/tests). */
export function encodeWavMono(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Int16Array(buffer, 44).set(samples);
  return new Uint8Array(buffer);
}
