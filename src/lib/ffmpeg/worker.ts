import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { WorkerInMessage, WorkerOutMessage, FileMetadata, ExtractionSettings, ExtractedFrame } from '../types';

console.log('[Worker] Starting FFmpeg worker...');

let ffmpeg: FFmpeg | null = null;
let isInitialized = false;

// Initialize FFmpeg
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

// Extract metadata from file
async function extractMetadata(file: File): Promise<FileMetadata> {
  if (!ffmpeg) throw new Error('FFmpeg not initialized');
  
  const inputName = 'input.' + file.name.split('.').pop();
  await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
  
  // Get metadata using ffprobe
  await ffmpeg.exec(['-i', inputName, '-f', 'null', '-']);
  
  // For now, use basic metadata extraction
  // In a real implementation, you'd parse ffmpeg output for exact values
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      const metadata: FileMetadata = {
        duration: video.duration,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        fps: 30, // Default, would need parsing from ffmpeg output
        codec: 'unknown',
        size: file.size,
        name: file.name
      };
      URL.revokeObjectURL(url);
      resolve(metadata);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };
    video.src = url;
  });
}

// Generate frame extraction commands
function generateExtractionCommands(
  inputName: string,
  settings: ExtractionSettings,
  metadata: FileMetadata
): string[] {
  const commands: string[] = ['-i', inputName];
  
  // Apply time range filters
  if (settings.startTime !== undefined) {
    commands.push('-ss', settings.startTime.toString());
  }
  
  if (settings.endTime !== undefined) {
    commands.push('-t', (settings.endTime - (settings.startTime || 0)).toString());
  }
  
  // Apply extraction mode
  switch (settings.mode) {
    case 'every':
      // Extract all frames (limited by maxFrames)
      commands.push('-vf', `select='not(mod(n\\,1))'`);
      break;
    
    case 'fps':
      if (settings.fps) {
        commands.push('-vf', `fps=${settings.fps}`);
      }
      break;
    
    case 'nth':
      if (settings.nth) {
        commands.push('-vf', `select='not(mod(n\\,${settings.nth}))'`);
      }
      break;
    
    case 'range':
      // Time range already handled above
      break;
  }
  
  // Apply scaling
  if (settings.scale.mode === 'custom' && settings.scale.width && settings.scale.height) {
    const scaleFilter = `scale=${settings.scale.width}:${settings.scale.height}`;
    const existingFilters = commands.indexOf('-vf') !== -1 ? commands[commands.indexOf('-vf') + 1] : '';
    if (existingFilters) {
      commands[commands.indexOf('-vf') + 1] = `${existingFilters},${scaleFilter}`;
    } else {
      commands.push('-vf', scaleFilter);
    }
  }
  
  // Output format
  commands.push('-f', 'image2', 'frame_%06d.png');
  
  return commands;
}

// Generate filename from pattern
function generateFilename(pattern: string, index: number, timestamp: number, basename: string, padLength: number): string {
  return pattern
    .replace('{basename}', basename)
    .replace('{frame}', index.toString().padStart(padLength, '0'))
    .replace('{timestamp_ms}', Math.floor(timestamp * 1000).toString());
}

// Extract frames from file
async function extractFrames(file: File, settings: ExtractionSettings): Promise<void> {
  if (!ffmpeg) throw new Error('FFmpeg not initialized');
  
  const inputName = 'input.' + file.name.split('.').pop();
  const basename = file.name.split('.')[0];
  
  try {
    // Write input file
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    
    // Get metadata first
    const metadata = await extractMetadata(file);
    postMessage({ type: 'META', metadata } as WorkerOutMessage);
    
    // Generate extraction commands
    const commands = generateExtractionCommands(inputName, settings, metadata);
    
    let frameCount = 0;
    let lastProgress = 0;
    
    // Set up progress tracking
    ffmpeg.on('progress', ({ progress, time }) => {
      const percent = Math.min(progress * 100, 100);
      if (percent - lastProgress >= 1) { // Only update every 1%
        postMessage({
          type: 'PROGRESS',
          progress: {
            frames: frameCount,
            percent,
            status: 'processing'
          }
        } as WorkerOutMessage);
        lastProgress = percent;
      }
    });
    
    // Execute extraction
    await ffmpeg.exec(commands);
    
    // Read extracted frames
    const files = await ffmpeg.listDir('/');
    const frameFiles = files.filter(f => f.name.startsWith('frame_') && f.name.endsWith('.png'));
    
    for (let i = 0; i < Math.min(frameFiles.length, settings.maxFrames); i++) {
      const frameFile = frameFiles[i];
      const data = await ffmpeg.readFile(frameFile.name);
      const blob = new Blob([data], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      
      const timestamp = (i / (settings.fps || metadata.fps || 30));
      const filename = generateFilename(
        settings.naming.pattern,
        i + 1,
        timestamp,
        basename,
        settings.naming.padLength
      ) + '.png';
      
      const frame: ExtractedFrame = {
        index: i + 1,
        timestamp,
        blob,
        url,
        filename
      };
      
      postMessage({ type: 'FRAME', frame } as WorkerOutMessage);
      frameCount++;
      
      // Clean up frame file
      await ffmpeg.deleteFile(frameFile.name);
    }
    
    postMessage({ type: 'COMPLETE', totalFrames: frameCount } as WorkerOutMessage);
    
  } catch (error) {
    postMessage({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    } as WorkerOutMessage);
  } finally {
    // Clean up
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (e) {
      // Ignore cleanup errors
    }
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
        await extractFrames(event.data.file, event.data.settings);
        break;
        
      case 'CANCEL':
        // Terminate worker to cancel processing
        self.close();
        break;
        
      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    console.error('[Worker] Error handling message:', error);
    postMessage({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    } as WorkerOutMessage);
  }
};