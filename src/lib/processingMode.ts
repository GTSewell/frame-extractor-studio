import type { ExtractionSettings, FileMetadata } from './types';

export type ProcessingEngine = 'image-decoder' | 'webcodecs' | 'ffmpeg';

export interface ProcessingCapability {
  engine: ProcessingEngine;
  supported: boolean;
  reason?: string;
}

export async function detectProcessingCapabilities(file: File, metadata?: FileMetadata): Promise<ProcessingCapability[]> {
  const capabilities: ProcessingCapability[] = [];

  // Check ImageDecoder support (for GIF/APNG)
  if ('ImageDecoder' in self || 'ImageDecoder' in window) {
    try {
      const ImageDecoderClass = (self as any).ImageDecoder || (window as any).ImageDecoder;
      const isSupported = await ImageDecoderClass.isTypeSupported(file.type);
      capabilities.push({
        engine: 'image-decoder',
        supported: isSupported,
        reason: isSupported ? undefined : `Image type ${file.type} not supported`
      });
    } catch (error) {
      capabilities.push({
        engine: 'image-decoder',
        supported: false,
        reason: `ImageDecoder error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  } else {
    capabilities.push({
      engine: 'image-decoder',
      supported: false,
      reason: 'ImageDecoder not available in this browser'
    });
  }

  // Check WebCodecs support (for video files)
  if ('VideoDecoder' in self || 'VideoDecoder' in window) {
    try {
      const VideoDecoderClass = (self as any).VideoDecoder || (window as any).VideoDecoder;
      
      // Common video codecs to check
      const codecsToCheck = [
        metadata?.codec,
        'avc1.42E01E', // H.264 baseline
        'avc1.64001E', // H.264 main
        'vp8',
        'vp09.00.10.08', // VP9
        'av01.0.04M.08' // AV1
      ].filter(Boolean);

      let supported = false;
      let supportedCodec = '';

      for (const codec of codecsToCheck) {
        try {
          const config = {
            codec: codec as string,
            width: metadata?.width || 1920,
            height: metadata?.height || 1080,
          };
          
          const result = await VideoDecoderClass.isConfigSupported(config);
          if (result.supported) {
            supported = true;
            supportedCodec = codec as string;
            break;
          }
        } catch (error) {
          // Continue checking other codecs
          continue;
        }
      }

      capabilities.push({
        engine: 'webcodecs',
        supported,
        reason: supported ? `Using codec: ${supportedCodec}` : 'No supported codec found for this video'
      });
    } catch (error) {
      capabilities.push({
        engine: 'webcodecs',
        supported: false,
        reason: `WebCodecs error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  } else {
    capabilities.push({
      engine: 'webcodecs',
      supported: false,
      reason: 'WebCodecs not available in this browser'
    });
  }

  // FFmpeg is always available as fallback
  capabilities.push({
    engine: 'ffmpeg',
    supported: true,
    reason: 'Universal fallback'
  });

  return capabilities;
}

export async function selectOptimalEngine(
  file: File, 
  settings: ExtractionSettings, 
  metadata?: FileMetadata
): Promise<ProcessingEngine> {
  // If user explicitly chose a processing mode, respect it
  if (settings.processingMode !== 'auto') {
    return settings.processingMode as ProcessingEngine;
  }

  // Auto-select based on file type and browser capabilities
  const capabilities = await detectProcessingCapabilities(file, metadata);
  
  // Prefer ImageDecoder for animated images (GIF, APNG)
  if (file.type.startsWith('image/')) {
    const imageDecoderCap = capabilities.find(c => c.engine === 'image-decoder');
    if (imageDecoderCap?.supported) {
      return 'image-decoder';
    }
  }

  // Prefer WebCodecs for video files if supported
  if (file.type.startsWith('video/')) {
    const webcodecsCap = capabilities.find(c => c.engine === 'webcodecs');
    if (webcodecsCap?.supported) {
      return 'webcodecs';
    }
  }

  // Fall back to FFmpeg
  return 'ffmpeg';
}

export function getEngineDisplayName(engine: ProcessingEngine): string {
  switch (engine) {
    case 'image-decoder':
      return 'ImageDecoder (fast)';
    case 'webcodecs':
      return 'WebCodecs (fast)';
    case 'ffmpeg':
      return 'FFmpeg (WASM)';
    default:
      return engine;
  }
}

export function getEngineDescription(engine: ProcessingEngine): string {
  switch (engine) {
    case 'image-decoder':
      return 'Native browser image decoding for animated images';
    case 'webcodecs':
      return 'Native browser video decoding with hardware acceleration';
    case 'ffmpeg':
      return 'Universal WebAssembly-based processing with broad format support';
    default:
      return '';
  }
}