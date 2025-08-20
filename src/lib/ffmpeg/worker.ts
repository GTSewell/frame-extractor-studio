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
  
  // Determine effective FPS for "every" mode to prevent memory issues
  const getEffectiveFps = () => {
    if (settings.mode === 'every') {
      // For "every" mode, limit to reasonable FPS to prevent stalls
      const originalFps = metadata.fps || 30;
      // Cap at 30fps for large files to prevent memory issues
      return Math.min(originalFps, 30);
    }
    return settings.fps || metadata.fps || 30;
  };
  
  // Apply extraction mode with improved efficiency
  switch (settings.mode) {
    case 'every':
      // Use fps filter instead of problematic select filter
      const effectiveFps = getEffectiveFps();
      commands.push('-vf', `fps=${effectiveFps}`);
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
      // Use fps for time range mode too
      commands.push('-vf', `fps=${getEffectiveFps()}`);
      break;
  }
  
  // Apply frame limit to prevent runaway extraction
  if (settings.maxFrames) {
    commands.push('-frames:v', settings.maxFrames.toString());
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
  
  // Output format with quality settings
  const extension = settings.outputFormat?.type === 'jpeg' ? 'jpg' : 'png';
  
  if (settings.outputFormat?.type === 'jpeg' && settings.outputFormat.quality) {
    commands.push('-q:v', Math.round((100 - settings.outputFormat.quality) / 3).toString());
  }
  
  commands.push('-f', 'image2', `frame_%06d.${extension}`);
  
  return commands;
}

function getOutputArgs(outputFormat: { type: string; quality?: number }): string[] {
  switch (outputFormat.type) {
    case 'jpeg':
      return ['-q:v', String(Math.round((100 - (outputFormat.quality || 90)) / 100 * 31) + 2)];
    case 'png-compressed':
      return ['-compression_level', '9'];
    case 'png':
    default:
      return [];
  }
}

// Check if file is a GIF/APNG and handle accordingly
function isGifOrApng(file: File): boolean {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.gif') || 
         fileName.endsWith('.apng') || 
         file.type === 'image/gif' ||
         file.type === 'image/apng';
}

// Extract frames from GIF using Canvas API
async function extractGifFrames(file: File, settings: ExtractionSettings): Promise<void> {
  const basename = file.name.split('.')[0];
  
  try {
    console.log('[Worker] Extracting GIF frames using Canvas API');
    
    // Create image element to load the GIF
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load GIF'));
      img.src = url;
    });
    
    // Extract metadata
    const metadata: FileMetadata = {
      duration: 2, // Estimate 2 seconds for GIFs
      width: img.naturalWidth,
      height: img.naturalHeight,
      fps: 10, // Estimate 10 FPS for GIFs
      codec: 'gif',
      size: file.size,
      name: file.name
    };
    
    postMessage({ type: 'META', metadata } as WorkerOutMessage);
    
    // Create canvas for frame extraction
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    // For now, we'll extract the single static frame
    // In a more advanced implementation, we could parse GIF frames
    ctx.drawImage(img, 0, 0);
    
    // Convert to desired output format
    const mimeType = settings.outputFormat.type === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = settings.outputFormat.type === 'jpeg' ? (settings.outputFormat.quality || 90) / 100 : undefined;
    
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to convert canvas to blob'));
      }, mimeType, quality);
    });
    
    const frameUrl = URL.createObjectURL(blob);
    const fileExtension = settings.outputFormat.type === 'jpeg' ? 'jpg' : 'png';
    const filename = settings.naming.pattern
      .replace('{basename}', basename)
      .replace('{frame}', '1'.padStart(settings.naming.padLength, '0'))
      .replace('{timestamp}', '0') + `.${fileExtension}`;
    
    const frame: ExtractedFrame = {
      index: 0,
      timestamp: 0,
      blob,
      url: frameUrl,
      filename
    };
    
    postMessage({ type: 'FRAME', frame } as WorkerOutMessage);
    postMessage({ type: 'COMPLETE', totalFrames: 1 } as WorkerOutMessage);
    
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('GIF extraction error:', error);
    postMessage({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'GIF extraction failed' 
    } as WorkerOutMessage);
  }
}

// Extract frames from file
async function extractFrames(file: File, settings: ExtractionSettings): Promise<void> {
  // Check if this is a GIF/APNG file
  if (isGifOrApng(file)) {
    console.log('[Worker] Detected GIF/APNG file, using Canvas API extraction');
    return extractGifFrames(file, settings);
  }
  
  // Continue with FFmpeg for video files
  if (!ffmpeg) throw new Error('FFmpeg not initialized');
  
  const inputName = 'input.' + file.name.split('.').pop();
  const basename = file.name.split('.')[0];
  
  // Set up extraction timeout (5 minutes)
  const EXTRACTION_TIMEOUT = 5 * 60 * 1000;
  let timeoutId: number | null = null;
  let isCompleted = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = self.setTimeout(() => {
      if (!isCompleted) {
        reject(new Error('Extraction timed out after 5 minutes. Try reducing frame rate or using a smaller time range.'));
      }
    }, EXTRACTION_TIMEOUT);
  });
  
  try {
    // Write input file
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    
    // Get metadata first
    const metadata = await extractMetadata(file);
    postMessage({ type: 'META', metadata } as WorkerOutMessage);
    
    // Generate improved extraction commands
    const commands = generateExtractionCommands(inputName, settings, metadata);
    console.log('[Worker] FFmpeg commands:', commands);
    
    let frameCount = 0;
    let lastProgress = 0;
    
    // Set up progress tracking with heartbeat
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
    
    // Execute extraction with timeout protection
    await Promise.race([
      ffmpeg.exec(commands),
      timeoutPromise
    ]);
    
    console.log('[Worker] FFmpeg execution completed');
    
    // Read extracted frames
    const files = await ffmpeg.listDir('/');
    const extension = settings.outputFormat?.type === 'jpeg' ? 'jpg' : 'png';
    const frameFiles = files.filter(f => 
      f.name.startsWith('frame_') && (f.name.endsWith('.png') || f.name.endsWith(`.${extension}`))
    );
    
    console.log(`[Worker] Found ${frameFiles.length} frame files`);
    
    if (frameFiles.length === 0) {
      throw new Error('No frames were extracted. Please try different settings or check if the video is valid.');
    }
    
    const totalFrames = Math.min(frameFiles.length, settings.maxFrames);
    
    for (let i = 0; i < totalFrames; i++) {
      const frameFile = frameFiles[i];
      const frameData = await ffmpeg.readFile(frameFile.name);
      
      // Create blob directly from frame data (skip re-encoding if PNG and original format)
      let blob: Blob;
      let mimeType: string;
      
      if (settings.outputFormat?.type === 'jpeg') {
        // Convert to JPEG
        const outputArgs = getOutputArgs(settings.outputFormat);
        const outputName = `output_${String(i).padStart(6, '0')}.jpg`;
        
        await ffmpeg.exec([
          '-i', frameFile.name,
          '-y',
          ...outputArgs,
          outputName
        ]);
        
        const data = await ffmpeg.readFile(outputName);
        blob = new Blob([data], { type: 'image/jpeg' });
        mimeType = 'image/jpeg';
        
        // Clean up temp file
        await ffmpeg.deleteFile(outputName);
      } else {
        // Use PNG directly
        blob = new Blob([frameData], { type: 'image/png' });
        mimeType = 'image/png';
      }
      
      const url = URL.createObjectURL(blob);
      
      // Calculate timestamp and filename
      const timestamp = (i / (metadata.fps || 30)) * 1000;
      const fileExtension = settings.outputFormat?.type === 'jpeg' ? 'jpg' : 'png';
      const filename = settings.naming.pattern
        .replace('{basename}', basename)
        .replace('{frame}', String(i + 1).padStart(settings.naming.padLength, '0'))
        .replace('{timestamp}', String(Math.round(timestamp))) + `.${fileExtension}`;
      
      const frame: ExtractedFrame = {
        index: i,
        timestamp,
        blob,
        url,
        filename
      };
      
      postMessage({ type: 'FRAME', frame } as WorkerOutMessage);
      
      // Update progress
      frameCount = i + 1;
      const percent = (frameCount / totalFrames) * 100;
      postMessage({
        type: 'PROGRESS',
        progress: {
          frames: frameCount,
          percent,
          status: 'processing'
        }
      } as WorkerOutMessage);
      
      // Clean up frame file immediately to save memory
      await ffmpeg.deleteFile(frameFile.name);
      
      // Allow browser to breathe every 10 frames
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    isCompleted = true;
    if (timeoutId) clearTimeout(timeoutId);
    
    // Clean up input file
    await ffmpeg.deleteFile(inputName);
    
    postMessage({
      type: 'COMPLETE',
      totalFrames: frameCount
    } as WorkerOutMessage);
    
  } catch (error) {
    isCompleted = true;
    if (timeoutId) clearTimeout(timeoutId);
    
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