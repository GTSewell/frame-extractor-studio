import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import JSZip from 'jszip';
import type { WorkerInMessage, WorkerOutMessage, ExtractionSettings, FileMetadata, ExtractedFrame } from '@/lib/types';

let ffmpeg: FFmpeg | null = null;
let ffmpegReady = false;
let basePath = '';
let cancelled = false;

// Post ALIVE immediately so the UI knows the worker booted
(postMessage as any)({ type: 'ALIVE' } as WorkerOutMessage);

async function check(url: string) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return true;
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function initFFmpeg() {
  if (ffmpegReady && ffmpeg) return;

  try {
    if (!basePath) {
      basePath = (self as any).location?.origin + '/ffmpeg';
    }

    const coreURL = `${basePath}/ffmpeg-core.js`;
    const wasmURL = `${basePath}/ffmpeg-core.wasm`;

    // Check if core files are accessible
    await check(coreURL);
    await check(wasmURL);

    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress, time }) => {
      if (!cancelled) {
        (postMessage as any)({
          type: 'PROGRESS',
          progress: {
            frames: Math.floor(time / 40),
            percent: Math.round(progress * 100),
            status: 'processing'
          }
        } as WorkerOutMessage);
      }
    });

    await ffmpeg.load({ coreURL, wasmURL });

    ffmpegReady = true;
    (postMessage as any)({ type: 'FFMPEG_READY' } as WorkerOutMessage);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    (postMessage as any)({ 
      type: 'ERROR', 
      error: `FFmpeg initialization failed: ${errorMsg}. Make sure FFmpeg core files are available at ${basePath}/`
    } as WorkerOutMessage);
    throw error;
  }
}

async function extractFrames(file: File, settings: ExtractionSettings, metadata?: FileMetadata) {
  if (!ffmpeg || !ffmpegReady) {
    throw new Error('FFmpeg not ready');
  }

  cancelled = false;
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const inputName = `input.${ext}`;
  
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const cmds: string[] = [];
  if (settings.startTime != null) cmds.push('-ss', String(settings.startTime));
  cmds.push('-i', inputName);
  if (settings.endTime != null) {
    const dur = settings.startTime ? (settings.endTime - settings.startTime) : settings.endTime;
    cmds.push('-t', String(dur));
  }

  const outExt = settings.outputFormat?.type === 'jpeg' ? 'jpg' : 'png';

  if (settings.mode === 'every') {
    cmds.push('-vsync', '0');
  } else if (settings.mode === 'fps') {
    const fps = Math.max(0.1, Math.min(240, settings.fps ?? 30));
    cmds.push('-vf', `fps=${fps}`, '-vsync', '0');
  } else if (settings.mode === 'nth') {
    const baseFps = metadata?.fps ?? 30;
    const fps = Math.max(0.1, baseFps / Math.max(1, settings.nth ?? 1));
    cmds.push('-vf', `fps=${fps}`, '-vsync', '0');
  }

  if (settings.scale?.mode === 'custom' && settings.scale.width && settings.scale.height) {
    const vfIndex = cmds.indexOf('-vf');
    if (vfIndex !== -1) {
      cmds[vfIndex + 1] = `${cmds[vfIndex + 1]},scale=${settings.scale.width}:${settings.scale.height}`;
    } else {
      cmds.push('-vf', `scale=${settings.scale.width}:${settings.scale.height}`);
    }
  }

  if (outExt === 'jpg' && settings.outputFormat?.quality) {
    const q = Math.round((100 - settings.outputFormat.quality) / 3);
    cmds.push('-q:v', String(q));
  }

  if (settings.maxFrames) {
    cmds.push('-frames:v', String(settings.maxFrames));
  }

  cmds.push(`frame_%06d.${outExt}`);

  await ffmpeg.exec(cmds);

  const files = await ffmpeg.listDir('/');
  const frameFiles = files.filter(file => {
    const name = typeof file === 'string' ? file : file.name;
    return name.startsWith('frame_') && name.endsWith(`.${outExt}`);
  });

  if (frameFiles.length === 0) {
    throw new Error('No frames were extracted');
  }

  const frames: ExtractedFrame[] = [];
  const zip = new JSZip();

  for (const file of frameFiles) {
    if (cancelled) break;

    const filename = typeof file === 'string' ? file : file.name;
    const data = await ffmpeg.readFile(filename);
    const blob = new Blob([data], { type: `image/${outExt === 'jpg' ? 'jpeg' : 'png'}` });
    
    const frameIndex = parseInt(filename.match(/frame_(\d+)/)?.[1] || '0', 10);
    const timestamp = frameIndex * (1000 / (metadata?.fps || 30));

    const frame: ExtractedFrame = {
      index: frameIndex,
      timestamp,
      blob,
      url: URL.createObjectURL(blob),
      filename
    };

    frames.push(frame);
    zip.file(filename, blob);

    (postMessage as any)({
      type: 'FRAME',
      frame
    } as WorkerOutMessage);
  }

  if (!cancelled) {
    if (settings.split?.enabled && settings.split.framesPerPart > 0) {
      const framesPerPart = settings.split.framesPerPart;
      const totalParts = Math.ceil(frames.length / framesPerPart);

      for (let partIndex = 0; partIndex < totalParts; partIndex++) {
        const startIdx = partIndex * framesPerPart;
        const endIdx = Math.min(startIdx + framesPerPart, frames.length);
        const partFrames = frames.slice(startIdx, endIdx);

        const partZip = new JSZip();
        for (const frame of partFrames) {
          partZip.file(frame.filename, frame.blob);
        }

        const zipBlob = await partZip.generateAsync({ type: 'blob' });
        const basename = file.name.replace(/\.[^/.]+$/, '');
        const partFilename = `${basename}_part_${partIndex + 1}_of_${totalParts}.zip`;

        (postMessage as any)({
          type: 'PART_READY',
          partIndex: partIndex + 1,
          totalParts,
          startFrame: startIdx,
          endFrame: endIdx - 1,
          filename: partFilename,
          zip: zipBlob
        } as WorkerOutMessage);
      }
    } else {
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const basename = file.name.replace(/\.[^/.]+$/, '');
      const filename = `${basename}_frames.zip`;

      (postMessage as any)({
        type: 'PART_READY',
        partIndex: 1,
        totalParts: 1,
        startFrame: 0,
        endFrame: frames.length - 1,
        filename,
        zip: zipBlob
      } as WorkerOutMessage);
    }

    (postMessage as any)({
      type: 'COMPLETE',
      totalFrames: frames.length
    } as WorkerOutMessage);
  }

  // Cleanup
  for (const file of frameFiles) {
    try {
      const filename = typeof file === 'string' ? file : file.name;
      await ffmpeg.deleteFile(filename);
    } catch (e) {
      console.warn(`Failed to delete file:`, e);
    }
  }
  
  try {
    await ffmpeg.deleteFile(inputName);
  } catch (e) {
    console.warn(`Failed to delete ${inputName}:`, e);
  }
}

self.onmessage = async (evt: MessageEvent<WorkerInMessage>) => {
  try {
    const msg = evt.data;

    if (msg.type === 'INIT') {
      basePath = (msg.basePath || '').replace(/\/$/, '');
      await initFFmpeg();
      return;
    }

    if (msg.type === 'EXTRACT') {
      await initFFmpeg();
      await extractFrames(msg.file, msg.settings, msg.metadata);
      return;
    }

    if (msg.type === 'CANCEL') {
      cancelled = true;
      (self as any).close();
    }
  } catch (err: any) {
    (postMessage as any)({
      type: 'ERROR',
      error: err?.message || String(err)
    } as WorkerOutMessage);
  }
};