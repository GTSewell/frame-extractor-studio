// ImageDecoder-based extractor for GIF/APNG; streams PNGs frame-by-frame.
type InMsg =
  | { type: 'EXTRACT_IMGDEC'; file: File; settings: any; metadata?: any }
  | { type: 'CANCEL' };

type OutMsg =
  | { type: 'ID_READY' }
  | { type: 'PROGRESS'; frames: number; percent: number }
  | { type: 'FRAME'; frame: { index: number; timestamp: number; filename: string; blob?: Blob; ab?: ArrayBuffer; mime: string } }
  | { type: 'COMPLETE'; totalFrames: number }
  | { type: 'ERROR'; error: string };

(postMessage as any)({ type: 'ID_READY' } as OutMsg);

// Route unhandled errors back to UI
self.onerror = (e: any) => (postMessage as any)({ type: 'ERROR', error: e?.message || String(e) });
self.onunhandledrejection = (e: any) => (postMessage as any)({ type: 'ERROR', error: e?.reason?.message || String(e?.reason || e) });

const has = (k: any) => typeof k !== 'undefined' && k !== null;

onmessage = async (evt: MessageEvent<InMsg>) => {
  const msg = evt.data;
  try {
    if (msg.type === 'CANCEL') { (self as any).close(); return; }
    if (msg.type !== 'EXTRACT_IMGDEC') return;

    if (!('ImageDecoder' in self) || !('OffscreenCanvas' in self)) {
      (postMessage as any)({ type: 'ERROR', error: 'ImageDecoder/OffscreenCanvas not supported' } as OutMsg);
      return;
    }

    const { file, settings, metadata } = msg;
    const mime = (file.type || '').toLowerCase();
    if (!/^image\/(gif|apng|png|webp)$/.test(mime)) {
      (postMessage as any)({ type: 'ERROR', error: `Unsupported type for ImageDecoder: ${mime}` } as OutMsg);
      return;
    }

    const buf = await file.arrayBuffer();
    // @ts-ignore
    const decoder = new ImageDecoder({ data: buf, type: mime });

    // ✅ Wait for tracks to be ready; otherwise frameCount can be 0/NaN and decodes may stall
    // @ts-ignore
    await decoder.tracks?.ready?.catch?.(() => {});

    // @ts-ignore
    const track = decoder.tracks?.selectedTrack;
    let frameCount = has(track?.frameCount) ? track.frameCount : NaN;

    // Fallback probe if frameCount unavailable
    if (!Number.isFinite(frameCount)) {
      let i = 0;
      try {
        for (;; i++) { await decoder.decode({ frameIndex: i, completeFramesOnly: true }); }
      } catch { frameCount = i; }
      // Recreate decoder to start from the beginning
      // @ts-ignore
      decoder.close?.();
      // @ts-ignore
      const d2 = new ImageDecoder({ data: buf, type: mime });
      // @ts-ignore
      await d2.tracks?.ready?.catch?.(() => {});
      // @ts-ignore
      (decoder as any) = d2;
    }

    if (!frameCount || frameCount < 1) {
      (postMessage as any)({ type: 'ERROR', error: 'No frames detected' } as OutMsg);
      return;
    }

    // Dimensions
    const w =
      // @ts-ignore
      track?.frameSize?.width || track?.codedWidth || track?.displayWidth || metadata?.width;
    const h =
      // @ts-ignore
      track?.frameSize?.height || track?.codedHeight || track?.displayHeight || metadata?.height;

    if (!w || !h) {
      (postMessage as any)({ type: 'ERROR', error: 'Could not determine frame size' } as OutMsg);
      return;
    }

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    const outMime = settings?.outputFormat?.type === 'jpeg' ? 'image/jpeg' : 'image/png';
    const baseName = (metadata?.name || file.name).replace(/\.[^.]+$/, '');
    const assumedFps = metadata?.fps || 10;

    // Watchdog: if no frame emitted for N seconds, abort so UI can fall back
    let lastTick = Date.now();
    const TIMEOUT_MS = 8000;
    const watchdog = setInterval(() => {
      if (Date.now() - lastTick > TIMEOUT_MS) {
        clearInterval(watchdog);
        (postMessage as any)({ type: 'ERROR', error: 'ImageDecoder stalled (watchdog)' } as OutMsg);
      }
    }, 1000);

    for (let i = 0; i < frameCount; i++) {
      const res = await (decoder as any).decode({ frameIndex: i, completeFramesOnly: true });
      const img = res.image; // ImageBitmap
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      try { img.close?.(); } catch {}

      // ❌ DO NOT use transfer list with Blob (not transferable) — it throws silently in worker
      const blob: Blob = await canvas.convertToBlob({ type: outMime });

      // Option A (simple & safe): send Blob (cloneable, not transferable)
      (postMessage as any)({
        type: 'FRAME',
        frame: {
          index: i,
          timestamp: Math.round((i / (assumedFps || 10)) * 1000),
          filename: `${baseName}_f${String(i).padStart(6, '0')}.${outMime === 'image/jpeg' ? 'jpg' : 'png'}`,
          blob,
          mime: outMime
        }
      } as OutMsg); // ← no transfer list here

      lastTick = Date.now();
      if ((i + 1) % 2 === 0 || i === frameCount - 1) {
        (postMessage as any)({ type: 'PROGRESS', frames: i + 1, percent: Math.round(((i + 1) / frameCount) * 100) } as OutMsg);
      }

      // Give the event loop a chance on big jobs
      // @ts-ignore
      await new Promise(r => setTimeout(r, 0));
    }

    clearInterval(watchdog);
    try { (decoder as any).close?.(); } catch {}
    (postMessage as any)({ type: 'COMPLETE', totalFrames: frameCount } as OutMsg);
  } catch (e: any) {
    (postMessage as any)({ type: 'ERROR', error: e?.message || String(e) } as OutMsg);
  }
};