import JSZip from 'jszip';
import type { WorkerInMessage, WorkerOutMessage, ExtractionSettings, FileMetadata, ExtractedFrame } from '@/lib/types';

let cancelled = false;

// Post ALIVE immediately so the UI knows the worker booted
(postMessage as any)({ type: 'ALIVE' } as WorkerOutMessage);

// Simple MP4 box parser to extract video track and samples
class MP4Parser {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
  }

  readBox(): { type: string; size: number; data: ArrayBuffer } | null {
    if (this.offset >= this.buffer.byteLength - 8) return null;

    const size = this.view.getUint32(this.offset);
    const typeBytes = new Uint8Array(this.buffer, this.offset + 4, 4);
    const type = String.fromCharCode(...typeBytes);
    
    const actualSize = size === 1 ? Number(this.view.getBigUint64(this.offset + 8)) : size;
    const headerSize = size === 1 ? 16 : 8;
    
    const data = this.buffer.slice(this.offset + headerSize, this.offset + actualSize);
    this.offset += actualSize;
    
    return { type, size: actualSize, data };
  }

  reset() {
    this.offset = 0;
  }
}

async function extractFramesFromVideo(file: File, settings: ExtractionSettings, metadata?: FileMetadata) {
  if (!('VideoDecoder' in self)) {
    throw new Error('VideoDecoder not supported in this browser');
  }

  cancelled = false;
  
  // Check if we can decode this video type
  const videoConfig = {
    codec: metadata?.codec || 'avc1.42E01E', // Default to H.264 baseline
    width: metadata?.width || 1920,
    height: metadata?.height || 1080,
  };

  try {
    const support = await (VideoDecoder as any).isConfigSupported(videoConfig);
    if (!support.supported) {
      throw new Error(`Video codec ${videoConfig.codec} not supported`);
    }
  } catch (error) {
    console.warn('Could not check codec support, proceeding anyway:', error);
  }

  const arrayBuffer = await file.arrayBuffer();
  const parser = new MP4Parser(arrayBuffer);

  const frames: ExtractedFrame[] = [];
  const zip = new JSZip();
  let frameIndex = 0;
  let processedFrames = 0;

  // Calculate frame selection parameters
  const targetFrameRate = settings.mode === 'fps' ? settings.fps : metadata?.fps;
  const skipFrames = settings.mode === 'nth' ? (settings.nth || 1) - 1 : 0;
  const startTime = (settings.startTime || 0) * 1000; // Convert to ms
  const endTime = settings.endTime ? settings.endTime * 1000 : undefined;

  return new Promise<void>((resolve, reject) => {
    const decoder = new (VideoDecoder as any)({
      output: async (videoFrame: any) => {
        if (cancelled) {
          videoFrame.close();
          return;
        }

        try {
          // Apply time-based filtering
          const timestamp = videoFrame.timestamp / 1000; // Convert to ms
          if (timestamp < startTime || (endTime && timestamp > endTime)) {
            videoFrame.close();
            return;
          }

          // Apply frame skipping
          if (skipFrames > 0 && frameIndex % (skipFrames + 1) !== 0) {
            frameIndex++;
            videoFrame.close();
            return;
          }

          // Apply max frames limit
          if (processedFrames >= settings.maxFrames) {
            videoFrame.close();
            return;
          }

          // Create canvas and draw the video frame
          let finalWidth = videoFrame.displayWidth || videoFrame.codedWidth;
          let finalHeight = videoFrame.displayHeight || videoFrame.codedHeight;

          if (settings.scale?.mode === 'custom' && settings.scale.width && settings.scale.height) {
            finalWidth = settings.scale.width;
            finalHeight = settings.scale.height;
          }

          const canvas = new OffscreenCanvas(finalWidth, finalHeight);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            videoFrame.close();
            throw new Error('Could not get canvas context');
          }

          ctx.drawImage(videoFrame, 0, 0, finalWidth, finalHeight);

          // Convert to blob
          const outputFormat = settings.outputFormat?.type === 'jpeg' ? 'image/jpeg' : 'image/png';
          const quality = settings.outputFormat?.type === 'jpeg' ? (settings.outputFormat.quality || 90) / 100 : undefined;
          
          const blob = await canvas.convertToBlob({ 
            type: outputFormat,
            quality 
          });

          const filename = `frame_${String(processedFrames + 1).padStart(settings.naming.padLength, '0')}.${outputFormat === 'image/jpeg' ? 'jpg' : 'png'}`;

          const frame: ExtractedFrame = {
            index: processedFrames,
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

          processedFrames++;

          // Post progress
          const estimatedTotal = Math.min(
            settings.maxFrames,
            metadata?.duration ? Math.floor(metadata.duration * (targetFrameRate || 30)) : 1000
          );
          const progress = Math.round((processedFrames / estimatedTotal) * 100);
          
          (postMessage as any)({
            type: 'PROGRESS',
            progress: {
              frames: processedFrames,
              percent: Math.min(progress, 100),
              status: 'processing'
            }
          } as WorkerOutMessage);

          videoFrame.close();

        } catch (error) {
          console.error('Error processing video frame:', error);
          videoFrame.close();
        }

        frameIndex++;
      },

      error: (error: any) => {
        console.error('VideoDecoder error:', error);
        reject(new Error(`VideoDecoder error: ${error.message}`));
      }
    });

    // Configure the decoder
    decoder.configure(videoConfig);

    // Simple chunk extraction - in a real implementation, you'd want a proper MP4 demuxer
    // For now, we'll try to extract some basic chunks
    try {
      let box;
      const chunks: ArrayBuffer[] = [];
      
      // This is a simplified approach - for production, use a proper MP4 demuxer library
      while ((box = parser.readBox()) !== null) {
        if (box.type === 'mdat') {
          // Media data box - contains the actual video data
          // In a real implementation, you'd parse the moov box to get sample locations
          // For now, we'll just try to decode the whole mdat as chunks
          const chunkSize = 1024 * 64; // 64KB chunks
          for (let i = 0; i < box.data.byteLength; i += chunkSize) {
            if (cancelled) break;
            
            const chunk = box.data.slice(i, Math.min(i + chunkSize, box.data.byteLength));
            if (chunk.byteLength > 0) {
              chunks.push(chunk);
            }
          }
          break;
        }
      }

      // Decode chunks
      for (const [index, chunk] of chunks.entries()) {
        if (cancelled) break;

        try {
          const encodedChunk = new (EncodedVideoChunk as any)({
            type: index === 0 ? 'key' : 'delta',
            timestamp: index * (1000000 / (targetFrameRate || 30)), // microseconds
            duration: 1000000 / (targetFrameRate || 30),
            data: chunk
          });

          decoder.decode(encodedChunk);
        } catch (error) {
          console.warn(`Error decoding chunk ${index}:`, error);
          // Continue with next chunk
        }
      }

      // Flush the decoder
      decoder.flush().then(async () => {
        // Handle output
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

        decoder.close();
        resolve();
      }).catch((error) => {
        decoder.close();
        reject(error);
      });

    } catch (error) {
      decoder.close();
      reject(error);
    }
  });
}

self.onmessage = async (evt: MessageEvent<WorkerInMessage>) => {
  try {
    const msg = evt.data;

    if (msg.type === 'EXTRACT') {
      await extractFramesFromVideo(msg.file, msg.settings, msg.metadata);
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