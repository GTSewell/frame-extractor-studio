// ImageDecoder-based extractor for GIF/APNG; streams PNGs frame-by-frame.
// Runs entirely in a Worker to keep UI responsive.

type InMsg =
  | { type: 'EXTRACT_IMGDEC'; file: File; settings: any; metadata?: any }
  | { type: 'CANCEL' };

type OutMsg =
  | { type: 'ID_READY' }
  | { type: 'PROGRESS'; frames: number; percent: number }
  | { type: 'FRAME'; frame: { index: number; timestamp: number; filename: string; blob: Blob } }
  | { type: 'COMPLETE'; totalFrames: number }
  | { type: 'ERROR'; error: string };

(postMessage as any)({ type: 'ID_READY' } as OutMsg);

const supports = (self as any).ImageDecoder && (self as any).OffscreenCanvas;
function err(msg: string) { (postMessage as any)({ type: 'ERROR', error: msg } as OutMsg); }

onmessage = async (evt: MessageEvent<InMsg>) => {
  const msg = evt.data;
  try {
    if (msg.type === 'CANCEL') { (self as any).close(); return; }
    if (msg.type !== 'EXTRACT_IMGDEC') return;

    if (!supports) { err('ImageDecoder/OffscreenCanvas not supported'); return; }

    const { file, settings } = msg;
    // Safety: only run for GIF/APNG/WebP animated types
    const mime = (file.type || '').toLowerCase();
    if (!/^image\/(gif|apng|png|webp)$/.test(mime)) { err(`Unsupported type for ImageDecoder: ${mime}`); return; }

    const buf = await file.arrayBuffer();
    // Some browsers prefer BufferSource (Uint8Array) instead of ArrayBuffer directly
    const data = new Uint8Array(buf);

    // Init decoder
    // @ts-ignore
    const decoder = new (self as any).ImageDecoder({ data, type: mime });
    const track = decoder.tracks?.selectedTrack;
    // frameCount occasionally undefined on some builds; fall back to probing.
    let frameCount = (track && typeof track.frameCount === 'number') ? track.frameCount : NaN;

    // Probe if needed (decode until it throws RangeError)
    if (!Number.isFinite(frameCount)) {
      let i = 0;
      try {
        for (;; i++) { await decoder.decode({ frameIndex: i, completeFramesOnly: true }); }
      } catch {
        frameCount = i; // first failure indicates no more frames
      }
      // reset by rebuilding decoder (cheap for small files)
      // @ts-ignore
      decoder.close?.();
      // @ts-ignore
      const decoder2 = new (self as any).ImageDecoder({ data, type: mime });
      (decoder as any) = decoder2;
    }

    if (!frameCount || frameCount < 1) { err('No frames detected'); return; }

    // Dimensions
    const dw = (track as any)?.frameSize?.width || (track as any)?.codedWidth || (track as any)?.displayWidth || 0;
    const dh = (track as any)?.frameSize?.height || (track as any)?.codedHeight || (track as any)?.displayHeight || 0;
    const width = dw || (msg.metadata?.width ?? 0);
    const height = dh || (msg.metadata?.height ?? 0);
    if (!width || !height) { err('Could not determine frame size'); return; }

    const canvas = new (self as any).OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) { err('2D canvas unavailable in worker'); return; }

    // Watchdog: if we don't emit any frame in N seconds, abort so UI can fallback
    const TIMEOUT_MS = 8000;
    let lastTick = Date.now();
    let watchdog: any = setInterval(() => {
      if (Date.now() - lastTick > TIMEOUT_MS) {
        clearInterval(watchdog);
        err('ImageDecoder stalled (watchdog)');
      }
    }, 1000);

    const assumedFps = msg.metadata?.fps || 10;
    const baseName = (msg.metadata?.name || file.name).replace(/\.[^.]+$/, '');
    const outExt = (settings?.outputFormat?.type === 'jpeg') ? 'jpg' : 'png';

    for (let i = 0; i < frameCount; i++) {
      // Important: completeFramesOnly=true ensures proper disposal/composition across frames.
      const res = await (decoder as any).decode({ frameIndex: i, completeFramesOnly: true });
      const img = res?.image;
      if (!img) { clearInterval(watchdog); err(`Decode returned no image @ frame ${i}`); return; }

      // Draw & encode
      ctx.clearRect(0, 0, width, height);
      // ImageDecoder returns ImageBitmap in most browsers
      ctx.drawImage(img, 0, 0);
      // @ts-ignore
      const blob: Blob = await canvas.convertToBlob({ type: outExt === 'jpg' ? 'image/jpeg' : 'image/png' });

      const filename = `${baseName}_f${String(i).padStart(6, '0')}.${outExt}`;
      const timestamp = Math.round((i / (assumedFps || 10)) * 1000);

      // Stream out immediately
      (postMessage as any)({
        type: 'FRAME',
        frame: { index: i, timestamp, filename, blob }
      } as OutMsg, [blob as any]);

      // Progress
      lastTick = Date.now();
      if ((i + 1) % 2 === 0 || i === frameCount - 1) {
        const percent = Math.round(((i + 1) / frameCount) * 100);
        (postMessage as any)({ type: 'PROGRESS', frames: i + 1, percent } as OutMsg);
      }

      // Release per-frame image
      try { (img as any).close?.(); } catch {}
    }

    clearInterval(watchdog);
    try { (decoder as any).close?.(); } catch {}
    (postMessage as any)({ type: 'COMPLETE', totalFrames: frameCount } as OutMsg);
  } catch (e: any) {
    err(e?.message || String(e));
  }
};