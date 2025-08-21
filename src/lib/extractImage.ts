export type ImgExtractOpts = {
  file: File;
  typeHint?: string;                     // e.g. "image/gif" / "image/webp" / "image/apng"
  nameBase?: string;                     // prefix for filenames
  out: 'png' | 'jpg';
  compressed?: boolean;                  // for PNG compression
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

  // Try to get frame size from track or decode first frame to get dimensions
  let w = (track as any)?.frameSize?.width || (track as any)?.displayWidth || 0;
  let h = (track as any)?.frameSize?.height || (track as any)?.displayHeight || 0;
  
  // If we can't get dimensions from track, decode first frame to get them
  if (!w || !h) {
    try {
      const { image } = await (dec as any).decode({ frameIndex: 0, completeFramesOnly: true });
      w = image.displayWidth || image.width;
      h = image.displayHeight || image.height;
      try { (image as any).close?.(); } catch {}
    } catch (e) {
      throw new Error(`Could not determine frame size: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  
  if (!w || !h) throw new Error('Could not determine frame size from track or first frame');

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

    let blob: Blob;
    if (out === 'jpg') {
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), mime, jpgQuality);
      });
    } else {
      // For PNG, check if it's compressed format
      const isCompressed = opts.compressed;
      if (isCompressed) {
        // Create compressed PNG by scaling and using JPEG compression then converting back
        const compressCanvas = document.createElement('canvas');
        const compressedSize = Math.min(w, h, 512); // Limit size for compression
        const scale = compressedSize / Math.max(w, h);
        compressCanvas.width = Math.round(w * scale);
        compressCanvas.height = Math.round(h * scale);
        const compressCtx = compressCanvas.getContext('2d');
        if (compressCtx) {
          compressCtx.imageSmoothingEnabled = true;
          compressCtx.imageSmoothingQuality = 'medium';
          compressCtx.drawImage(canvas, 0, 0, compressCanvas.width, compressCanvas.height);
          
          // Convert to JPEG for compression, then back to PNG
          const tempJpeg = await new Promise<Blob>((resolve, reject) => {
            compressCanvas.toBlob(b => b ? resolve(b) : reject(new Error('temp jpeg failed')), 'image/jpeg', 0.3);
          });
          
          // Load compressed JPEG and convert to PNG
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = URL.createObjectURL(tempJpeg);
          });
          
          compressCtx.clearRect(0, 0, compressCanvas.width, compressCanvas.height);
          compressCtx.drawImage(img, 0, 0);
          URL.revokeObjectURL(img.src);
          
          blob = await new Promise((resolve, reject) => {
            compressCanvas.toBlob(b => b ? resolve(b) : reject(new Error('compressed png failed')), mime);
          });
        } else {
          blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), mime);
          });
        }
      } else {
        blob = await new Promise((resolve, reject) => {
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), mime);
        });
      }
    }

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