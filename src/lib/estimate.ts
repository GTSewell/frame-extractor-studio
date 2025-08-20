import type { FileMetadata, ExtractionSettings } from './types';

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do {
    bytes /= 1024;
    i++;
  } while (bytes >= 1024 && i < units.length - 1);
  return `${bytes.toFixed(bytes >= 100 ? 0 : bytes >= 10 ? 1 : 2)} ${units[i]}`;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export interface EstimateResult {
  frames: number;
  durationSec: number;
  assumedFps: number;
  dims: { width: number; height: number };
  sizeBytesMid: number;
  sizeBytesLow: number;
  sizeBytesHigh: number;
  notes: string[];   // e.g. "fps unknown, assuming 30"
}

export function estimateFramesAndZip(
  meta: FileMetadata,
  settings: ExtractionSettings
): EstimateResult {
  const notes: string[] = [];

  // Convert duration from ms to seconds - actually duration is already in seconds
  const totalDurationSec = meta.duration;

  // Effective duration (seconds)
  const start = clamp(settings.startTime ?? 0, 0, Math.max(totalDurationSec, 0));
  const rawEnd = settings.endTime ?? totalDurationSec;
  const end = clamp(rawEnd, start, totalDurationSec);
  const durationSec = Math.max(0, end - start);

  // Effective dimensions
  const width = settings.scale?.mode === 'custom' && settings.scale.width ? settings.scale.width : meta.width;
  const height = settings.scale?.mode === 'custom' && settings.scale.height ? settings.scale.height : meta.height;

  // Effective FPS & frame count
  const defaultFps = 30;
  let assumedFps = meta.fps ?? defaultFps;
  if (!meta.fps) notes.push('Source FPS unknown — assuming 30 fps.');

  let frames = 0;

  if (settings.mode === 'every') {
    frames = Math.max(1, Math.round(durationSec * assumedFps));
    notes.push('"Every frame" uses average FPS to estimate count.');
  } else if (settings.mode === 'fps') {
    assumedFps = clamp(settings.fps ?? defaultFps, 1, 240);
    frames = Math.max(1, Math.round(durationSec * assumedFps));
  } else if (settings.mode === 'nth') {
    const nth = clamp(settings.nth ?? 1, 1, 9999);
    const base = meta.fps ?? defaultFps;
    assumedFps = Math.max(1, Math.floor(base / nth));
    frames = Math.max(1, Math.round(durationSec * assumedFps));
    notes.push(`Every ${nth}${nth === 1 ? 'st' : nth === 2 ? 'nd' : nth === 3 ? 'rd' : 'th'} frame → ~${assumedFps} fps from base ${base} fps.`);
  } else if (settings.mode === 'range') {
    // Range mode - similar to every frame but within specified range
    frames = Math.max(1, Math.round(durationSec * assumedFps));
    notes.push('Range mode extracts all frames within specified time range.');
  }

  // Apply max frames limit if set
  if (settings.maxFrames && frames > settings.maxFrames) {
    frames = settings.maxFrames;
    notes.push(`Capped at ${settings.maxFrames} frames (soft limit).`);
  }

  // Output format & compression heuristic (bytes-per-pixel compressed)
  // These are broad ranges; content can vary a lot.
  const fmt = settings.outputFormat;
  let bppMid: number, bppLow: number, bppHigh: number;

  if (fmt.type === 'png' || fmt.type === 'png-compressed') {
    // Photographic: 0.6–1.2; flat UI/art can be much smaller (0.05–0.3)
    if (fmt.type === 'png-compressed') {
      bppLow = 0.4; bppMid = 0.7; bppHigh = 1.0;
      notes.push('PNG compressed - size varies by content; estimate shown is mid-range.');
    } else {
      bppLow = 0.6; bppMid = 0.9; bppHigh = 1.2;
      notes.push('PNG size varies by content; estimate shown is mid-range.');
    }
  } else { // jpeg
    const q = clamp(fmt.quality ?? 85, 1, 100);
    // Rough mapping: better quality → higher bytes per pixel.
    // 95 ≈ 0.5, 85 ≈ 0.35, 70 ≈ 0.25
    const mid = q >= 90 ? 0.45 : q >= 80 ? 0.35 : 0.25;
    bppMid = mid; bppLow = mid * 0.7; bppHigh = mid * 1.4;
    notes.push(`JPEG quality ~${q}.`);
  }

  const pixelsPerFrame = width * height;
  const mid = frames * pixelsPerFrame * bppMid;
  const low = frames * pixelsPerFrame * bppLow;
  const high = frames * pixelsPerFrame * bppHigh;

  return {
    frames,
    durationSec,
    assumedFps,
    dims: { width, height },
    sizeBytesMid: mid,
    sizeBytesLow: low,
    sizeBytesHigh: high,
    notes
  };
}

export function recommendFramesPerPart(
  estBytesPerFrame: number,        // mid estimate per frame
  targetZipBytes = 500 * 1024 * 1024   // ~500 MB
) {
  if (estBytesPerFrame <= 0) return 250;
  const f = Math.floor(targetZipBytes / estBytesPerFrame);
  return Math.max(100, Math.min(2000, f || 250)); // clamp to [100, 2000]
}