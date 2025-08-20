// FRAMED Types

export interface FileMetadata {
  duration: number;
  width: number;
  height: number;
  fps?: number;
  codec?: string;
  size: number;
  name: string;
}

export interface ExtractionSettings {
  mode: 'every' | 'fps' | 'nth' | 'range';
  fps?: number;
  nth?: number;
  startTime?: number;
  endTime?: number;
  scale: {
    mode: 'original' | 'custom';
    width?: number;
    height?: number;
  };
  naming: {
    pattern: string;
    padLength: number;
  };
  maxFrames: number;
  outputFormat: {
    type: 'png' | 'jpeg' | 'png-compressed';
    quality?: number; // For JPEG (1-100)
  };
}

export interface ExtractedFrame {
  index: number;
  timestamp: number;
  blob: Blob;
  url: string;
  filename: string;
}

export interface ExtractionProgress {
  frames: number;
  percent: number;
  eta?: number;
  status: 'idle' | 'processing' | 'complete' | 'error' | 'cancelled';
  error?: string;
}

// Worker Messages
export type WorkerInMessage =
  | { type: 'INIT' }
  | { 
      type: 'EXTRACT'; 
      file: File; 
      settings: ExtractionSettings;
      metadata?: FileMetadata;
    }
  | { type: 'CANCEL' };

export type WorkerOutMessage =
  | { type: 'READY' }
  | { type: 'META'; metadata: FileMetadata }
  | { type: 'PROGRESS'; progress: ExtractionProgress }
  | { type: 'FRAME'; frame: ExtractedFrame }
  | { type: 'COMPLETE'; totalFrames: number }
  | { type: 'ERROR'; error: string };

export const SUPPORTED_FORMATS = {
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'image/gif': ['.gif'],
  'image/apng': ['.apng'],
  'image/png': ['.png'] // for APNG detection
} as const;

export const DEFAULT_SETTINGS: ExtractionSettings = {
  mode: 'every',
  scale: { mode: 'original' },
  naming: {
    pattern: '{basename}_f{frame}',
    padLength: 6
  },
  maxFrames: 2000,
  outputFormat: {
    type: 'png',
    quality: 90
  }
};