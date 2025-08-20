import JSZip from 'jszip';
import type { WorkerInMessage, WorkerOutMessage, ExtractionSettings, FileMetadata, ExtractedFrame } from '@/lib/types';

let cancelled = false;

// Post ALIVE immediately so the UI knows the worker booted
(postMessage as any)({ type: 'ALIVE' } as WorkerOutMessage);

async function extractFramesFromImage(file: File, settings: ExtractionSettings, metadata?: FileMetadata) {
  if (!('ImageDecoder' in self)) {
    throw new Error('ImageDecoder not supported in this browser');
  }

  cancelled = false;
  
  // Check if the image type is supported
  const isSupported = await (ImageDecoder as any).isTypeSupported(file.type);
  if (!isSupported) {
    throw new Error(`Image type ${file.type} not supported by ImageDecoder`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const decoder = new (ImageDecoder as any)({ data: arrayBuffer, type: file.type });
  
  const track = decoder.tracks.selectedTrack;
  if (!track) {
    throw new Error('No track found in image');
  }

  const totalFrames = Math.min(track.frameCount, settings.maxFrames);
  console.log(`ImageDecoder: Processing ${totalFrames} frames from ${file.name}`);

  const frames: ExtractedFrame[] = [];
  const zip = new JSZip();

  // Apply frame selection based on settings
  let frameIndices: number[] = [];
  
  if (settings.mode === 'every') {
    frameIndices = Array.from({ length: totalFrames }, (_, i) => i);
  } else if (settings.mode === 'nth' && settings.nth) {
    for (let i = 0; i < totalFrames; i += settings.nth) {
      frameIndices.push(i);
    }
  } else if (settings.mode === 'fps' && settings.fps && metadata?.fps) {
    const step = Math.max(1, Math.round(metadata.fps / settings.fps));
    for (let i = 0; i < totalFrames; i += step) {
      frameIndices.push(i);
    }
  } else {
    // Default to every frame
    frameIndices = Array.from({ length: totalFrames }, (_, i) => i);
  }

  // Apply maxFrames limit
  frameIndices = frameIndices.slice(0, settings.maxFrames);

  for (const [processedIndex, frameIndex] of frameIndices.entries()) {
    if (cancelled) break;

    try {
      const { image } = await decoder.decode({ frameIndex });
      
      // Create canvas and draw the image
      const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        image.close();
        throw new Error('Could not get canvas context');
      }

      // Apply scaling if needed
      let finalWidth = image.displayWidth;
      let finalHeight = image.displayHeight;
      
      if (settings.scale?.mode === 'custom' && settings.scale.width && settings.scale.height) {
        finalWidth = settings.scale.width;
        finalHeight = settings.scale.height;
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        ctx.drawImage(image, 0, 0, finalWidth, finalHeight);
      } else {
        ctx.drawImage(image, 0, 0);
      }

      // Convert to blob
      const outputFormat = settings.outputFormat?.type === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = settings.outputFormat?.type === 'jpeg' ? (settings.outputFormat.quality || 90) / 100 : undefined;
      
      const blob = await canvas.convertToBlob({ 
        type: outputFormat,
        quality 
      });

      const filename = `frame_${String(frameIndex + 1).padStart(settings.naming.padLength, '0')}.${outputFormat === 'image/jpeg' ? 'jpg' : 'png'}`;
      const timestamp = frameIndex * (1000 / (metadata?.fps || 30)); // Approximate timestamp

      const frame: ExtractedFrame = {
        index: frameIndex,
        timestamp,
        blob,
        url: URL.createObjectURL(blob),
        filename
      };

      frames.push(frame);
      zip.file(filename, blob);

      // Post frame
      (postMessage as any)({
        type: 'FRAME',
        frame
      } as WorkerOutMessage);

      // Post progress
      const progress = Math.round(((processedIndex + 1) / frameIndices.length) * 100);
      (postMessage as any)({
        type: 'PROGRESS',
        progress: {
          frames: processedIndex + 1,
          percent: progress,
          status: 'processing'
        }
      } as WorkerOutMessage);

      image.close();

    } catch (error) {
      console.error(`Error processing frame ${frameIndex}:`, error);
      // Continue with next frame
    }
  }

  if (!cancelled && frames.length > 0) {
    // Handle split export
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

  decoder.close?.();
}

self.onmessage = async (evt: MessageEvent<WorkerInMessage>) => {
  try {
    const msg = evt.data;

    if (msg.type === 'EXTRACT') {
      await extractFramesFromImage(msg.file, msg.settings, msg.metadata);
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