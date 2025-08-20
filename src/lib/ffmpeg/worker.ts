import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { WorkerInMessage, WorkerOutMessage, FileMetadata, ExtractionSettings } from '../types';

console.log('[Worker] Starting FFmpeg worker...');

let ffmpeg: FFmpeg | null = null;
let isInitialized = false;

// Initialize FFmpeg with cross-origin isolation support
async function initFFmpeg(): Promise<void> {
  if (isInitialized) return;
  
  console.log('[Worker] Initializing FFmpeg...');
  
  try {
    ffmpeg = new FFmpeg();
    
    // Add logging
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress, time }) => {
      console.log('[FFmpeg Progress]', { progress, time });
      // Send progress updates to main thread
      postMessage({
        type: 'PROGRESS',
        progress: {
          frames: 0, // Will be updated separately
          percent: Math.min(progress * 100, 100),
          status: 'processing'
        }
      } as WorkerOutMessage);
    });
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.15/dist/esm';
    
    console.log('[Worker] Loading FFmpeg core files...');
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    console.log('[Worker] FFmpeg initialized successfully');
    isInitialized = true;
  } catch (error) {
    console.error('[Worker] Failed to initialize FFmpeg:', error);
    throw new Error(`Failed to initialize FFmpeg: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Safe metadata function that doesn't use DOM APIs
async function safeMetadata(file: File, passed?: FileMetadata): Promise<FileMetadata> {
  if (passed) return passed;
  
  // Fallback metadata without DOM APIs
  return {
    duration: 0,
    width: 0,
    height: 0,
    fps: 30, // Default fallback
    size: file.size,
    name: file.name,
  };
}

// Extract frames using FFmpeg only (no DOM APIs)
async function extractFrames(file: File, settings: ExtractionSettings, metadata?: FileMetadata): Promise<void> {
  if (!ffmpeg) throw new Error('FFmpeg not initialized');
  
  console.log('[Worker] Starting frame extraction...');
  
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const inputName = `input.${ext}`;
  
  try {
    // Write input file
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    
    // Use metadata from main thread (DOM-free)
    const meta = await safeMetadata(file, metadata);
    postMessage({ type: 'META', metadata: meta } as WorkerOutMessage);
    
    // Build extraction command
    const outExt = settings.outputFormat?.type === 'jpeg' ? 'jpg' : 'png';
    const fps = (() => {
      if (settings.mode === 'fps' && settings.fps) return settings.fps;
      if (settings.mode === 'nth' && settings.nth && meta.fps) return Math.max(1, Math.floor(meta.fps / settings.nth));
      // Default / "every" guard: cap to something reasonable if meta.fps is huge
      return Math.min(meta.fps ?? 30, 30);
    })();

    const cmds: string[] = ['-i', inputName];

    // Time range
    if (settings.startTime !== undefined) cmds.push('-ss', String(settings.startTime));
    if (settings.endTime !== undefined) cmds.push('-t', String(settings.endTime - (settings.startTime || 0)));

    // FPS / sampling - use fps filter for better performance
    cmds.push('-vf', `fps=${fps}`, '-vsync', '0');

    // Optional resize
    if (settings.scale?.mode === 'custom' && settings.scale.width && settings.scale.height) {
      const idx = cmds.indexOf('-vf');
      cmds[idx + 1] = `${cmds[idx + 1]},scale=${settings.scale.width}:${settings.scale.height}`;
    }

    // JPEG quality if chosen
    if (settings.outputFormat?.type === 'jpeg' && settings.outputFormat.quality) {
      const q = Math.round((100 - settings.outputFormat.quality) / 3);
      cmds.push('-q:v', String(q));
    }

    // Frame limit (soft cap)
    if (settings.maxFrames) cmds.push('-frames:v', String(settings.maxFrames));

    // Output pattern
    cmds.push(`frame_%06d.${outExt}`);

    console.log('[Worker] FFmpeg commands:', cmds);

    // Run FFmpeg
    await ffmpeg.exec(cmds);

    // Collect frames
    const files = await ffmpeg.listDir('/');
    const frames = files
      .map(f => f.name)
      .filter(n => /^frame_\d{6}\.(png|jpg)$/.test(n))
      .sort(); // Ensure proper order

    if (frames.length === 0) {
      postMessage({ type: 'ERROR', error: 'No frames were extracted. Try a lower FPS or a shorter range.' } as WorkerOutMessage);
      return;
    }

    console.log(`[Worker] Found ${frames.length} frames to process`);

    // Stream frames back to main thread
    for (let i = 0; i < frames.length; i++) {
      const name = frames[i];
      const data = await ffmpeg.readFile(name);
      const blob = new Blob([data], { type: outExt === 'jpg' ? 'image/jpeg' : 'image/png' });

      // Rough timestamp estimate 
      const timestamp = (i / (meta.fps || fps)) * 1000;

      // Generate filename following naming pattern
      const filename = settings.naming.pattern
        .replace('{basename}', meta.name.replace(/\.[^.]+$/, ''))
        .replace('{frame}', String(i + 1).padStart(settings.naming.padLength, '0'))
        .replace('{timestamp}', String(Math.round(timestamp))) + `.${outExt}`;

      postMessage({
        type: 'FRAME',
        frame: {
          index: i,
          timestamp,
          filename,
          blob,
          // URL will be created in main thread
        }
      } as WorkerOutMessage);

      // Update progress
      const percent = ((i + 1) / frames.length) * 100;
      postMessage({
        type: 'PROGRESS',
        progress: {
          frames: i + 1,
          percent,
          status: 'processing'
        }
      } as WorkerOutMessage);

      // Clean up frame file immediately to save memory
      await ffmpeg.deleteFile(name);

      // Allow browser to breathe every 10 frames
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Cleanup input file
    await ffmpeg.deleteFile(inputName);

    postMessage({ type: 'COMPLETE', totalFrames: frames.length } as WorkerOutMessage);
    console.log('[Worker] Extraction complete');

  } catch (error) {
    console.error('[Worker] FFmpeg extraction failed:', error);
    
    // Clean up files on error
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (cleanupError) {
      console.warn('[Worker] Failed to clean up input file:', cleanupError);
    }
    
    postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'FFmpeg extraction failed'
    } as WorkerOutMessage);
  }
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const { type } = event.data;
  
  try {
    switch (type) {
      case 'INIT':
        console.log('[Worker] Received INIT message');
        await initFFmpeg();
        postMessage({ type: 'READY' } as WorkerOutMessage);
        break;
        
      case 'EXTRACT':
        console.log('[Worker] Received EXTRACT message');
        if (!isInitialized) {
          console.log('[Worker] FFmpeg not initialized, initializing now...');
          await initFFmpeg();
        }
        const { file, settings, metadata } = event.data;
        await extractFrames(file, settings, metadata);
        break;
        
      case 'CANCEL':
        console.log('[Worker] Received CANCEL message');
        self.close();
        break;
        
      default:
        console.warn('[Worker] Unknown message type:', type);
    }
  } catch (error) {
    console.error('[Worker] Error handling message:', error);
    postMessage({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    } as WorkerOutMessage);
  }
};