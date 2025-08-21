export type ImgExtractOpts = {
  file: File;
  typeHint?: string;                     // e.g. "image/gif" / "image/webp" / "image/apng"
  nameBase?: string;                     // prefix for filenames
  out: 'png' | 'jpg';
  jpgQuality?: number;                   // 0..1 (only used for jpg)
  fpsHint?: number;                      // used for timestamp estimation
  onFrame: (index: number, blob: Blob, filename: string, ms: number) => void;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
};

export async function extractAnimatedImageOnMain(opts: ImgExtractOpts): Promise<number> {
  const { file, typeHint = file.type || 'image/gif', out, jpgQuality = 0.92, fpsHint = 10,
          onFrame, onProgress, signal } = opts;

  if (!('ImageDecoder' in window)) throw new Error('ImageDecoder not supported in this browser');
  const ab = await file.arrayBuffer();
  // @ts-ignore
  const dec = new ImageDecoder({ data: ab, type: typeHint });

  // Wait for tracks to be ready so frameCount is reliable
  // @ts-ignore
  await dec.tracks?.ready?.catch?.(() => {});
  // @ts-ignore
  const track = dec.tracks?.selectedTrack;
  let count = track?.frameCount as number | undefined;

  // Probe count if missing
  if (!Number.isFinite(count)) {
    let i = 0;
    try { for (;; i++) await dec.decode({ frameIndex: i, completeFramesOnly: true }); }
    catch { /* first failure means end */ }
    count = i;
    try { /* rebuild to start from 0 */ // @ts-ignore
      dec.close?.(); // @ts-ignore
      const d2 = new ImageDecoder({ data: ab, type: typeHint }); // @ts-ignore
      await d2.tracks?.ready?.catch?.(() => {}); // @ts-ignore
      Object.assign(dec, d2);
    } catch {}
  }

  if (!count || count < 1) throw new Error('No frames detected');

  const w = (track as any)?.frameSize?.width || (track as any)?.displayWidth || 0;
  const h = (track as any)?.frameSize?.height || (track as any)?.displayHeight || 0;
  if (!w || !h) throw new Error('Could not determine frame size');

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  const base = (opts.nameBase ?? file.name.replace(/\.[^.]+$/, ''));
  const mime = out === 'jpg' ? 'image/jpeg' : 'image/png';

  for (let i = 0; i < count; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    // decode with composition/disposal handled by UA
    const { image } = await (dec as any).decode({ frameIndex: i, completeFramesOnly: true });
    ctx.clearRect(0, 0, w, h);
    // Image is an ImageBitmap
    ctx.drawImage(image, 0, 0);
    try { (image as any).close?.(); } catch {}

    const blob: Blob = await new Promise((resolve, reject) => {
      if (out === 'jpg') canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), mime, jpgQuality);
      else canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), mime);
    });

    const ms = Math.round((i / (fpsHint || 10)) * 1000);
    const filename = `${base}_f${String(i).padStart(6, '0')}.${out}`;
    onFrame(i, blob, filename, ms);

    if (onProgress && (i % 2 === 1 || i === count - 1)) onProgress(i + 1, count);
    // yield so UI remains responsive
    await new Promise(r => setTimeout(r, 0));
  }

  try { // @ts-ignore
    dec.close?.();
  } catch {}
  return count!;
}