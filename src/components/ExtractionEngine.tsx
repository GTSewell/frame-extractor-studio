import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Download, Play, Square, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { 
  ExtractionSettings, 
  FileMetadata, 
  ExtractedFrame, 
  ExtractionProgress,
  WorkerInMessage,
  WorkerOutMessage,
  PartReady
} from '@/lib/types';
import { estimateFramesAndZip } from '@/lib/estimate';
import Diagnostics from '@/components/Diagnostics';
import FfmpegWorker from '@/workers/ffmpeg.worker?worker';

interface ExtractionEngineProps {
  file: File | null;
  metadata?: FileMetadata;
  settings: ExtractionSettings;
  onFramesExtracted?: (frames: ExtractedFrame[]) => void;
  onProgressUpdate?: (progress: ExtractionProgress) => void;
}

export function ExtractionEngine({ 
  file, 
  metadata, 
  settings, 
  onFramesExtracted,
  onProgressUpdate 
}: ExtractionEngineProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState<ExtractionProgress>({
    frames: 0,
    percent: 0,
    status: 'idle'
  });
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [workerAlive, setWorkerAlive] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [ffmpegInitMode, setFfmpegInitMode] = useState<'blob' | 'http' | null>(null);
  const [lastWorkerError, setLastWorkerError] = useState<string | null>(null);
  const [generatedParts, setGeneratedParts] = useState<Array<{
    partIndex: number;
    totalParts: number;
    startFrame: number;
    endFrame: number;
    filename: string;
    blob: Blob;
    url: string;
  }>>([]);

  const workerRef = useRef<Worker | null>(null);
  const basePath = `${window.location.origin}${(import.meta as any).env?.BASE_URL ?? '/'}`.replace(/\/$/, '') + '/ffmpeg';
  const { toast } = useToast();

  // Initialize worker on mount
  useEffect(() => {
    const worker = new FfmpegWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const { type } = event.data;
      
      switch (type) {
        case 'ALIVE':
          setWorkerAlive(true);
          setLastWorkerError(null);
          // Send INIT with absolute base path for core files
          worker.postMessage({ type: 'INIT', basePath } as WorkerInMessage);
          break;

        case 'FFMPEG_READY':
          setFfmpegReady(true);
          setFfmpegInitMode((event.data as any).initMode ?? null);
          break;

        case 'READY':
          // Legacy support - treat as FFMPEG_READY
          setFfmpegReady(true);
          break;

        case 'META':
          // Handle metadata if needed
          break;

        case 'PROGRESS':
          setProgress((event.data as any).progress);
          onProgressUpdate?.((event.data as any).progress);
          break;

        case 'FRAME':
          setFrames(prev => [...prev, (event.data as any).frame]);
          break;

        case 'PART_READY':
          const partData = event.data as PartReady;
          const partUrl = URL.createObjectURL(partData.zip);
          
          setGeneratedParts(prev => [...prev, {
            partIndex: partData.partIndex,
            totalParts: partData.totalParts,
            startFrame: partData.startFrame,
            endFrame: partData.endFrame,
            filename: partData.filename,
            blob: partData.zip,
            url: partUrl
          }]);

          if (settings.split?.autoDownload !== false) {
            const link = document.createElement('a');
            link.href = partUrl;
            link.download = partData.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }

          toast({
            title: "Part Ready",
            description: `Part ${partData.partIndex}/${partData.totalParts} is ready for download`,
          });
          break;

        case 'COMPLETE':
          setIsExtracting(false);
          setProgress(prev => ({ ...prev, status: 'complete' }));
          
          toast({
            title: "Extraction Complete!",
            description: `Successfully extracted ${(event.data as any).totalFrames} frames`,
          });

          onFramesExtracted?.(frames);
          break;

        case 'ERROR':
          setIsExtracting(false);
          setLastWorkerError((event.data as any).error);
          setProgress(prev => ({ ...prev, status: 'error', error: (event.data as any).error }));
          
          toast({
            title: "Extraction Failed",
            description: (event.data as any).error,
            variant: "destructive",
          });
          break;
      }
    };

    worker.onerror = (error) => {
      console.error('Worker error:', error);
      setLastWorkerError(`Worker crashed: ${String(error)}`);
      setWorkerAlive(false);
      setFfmpegReady(false);
      setIsExtracting(false);
      setProgress(prev => ({ ...prev, status: 'error', error: 'Worker failed to initialize' }));
      
      toast({
        title: "Worker Error",
        description: "Failed to initialize video processing worker",
        variant: "destructive",
      });
    };

    return () => {
      worker.terminate();
      
      // Clean up object URLs
      frames.forEach(frame => {
        if (frame.url) {
          URL.revokeObjectURL(frame.url);
        }
      });
      
      generatedParts.forEach(part => {
        if (part.url) {
          URL.revokeObjectURL(part.url);
        }
      });
    };
  }, []);

  const startExtraction = async () => {
    if (!file || !metadata) return;
    
    if (!workerRef.current) {
      toast({
        title: "Worker Error",
        description: "Video processing worker is not available",
        variant: "destructive",
      });
      return;
    }

    if (!ffmpegReady) {
      toast({
        title: "Please wait",
        description: "Initializing FFmpeg...",
      });
      return;
    }

    try {
      setIsExtracting(true);
      setFrames([]);
      setGeneratedParts([]);
      setProgress({
        frames: 0,
        percent: 0,
        status: 'processing'
      });

      workerRef.current.postMessage({
        type: 'EXTRACT',
        file,
        settings,
        metadata
      } as WorkerInMessage);

    } catch (error) {
      console.error('Failed to start extraction:', error);
      setIsExtracting(false);
      toast({
        title: "Error",
        description: "Failed to start frame extraction",
        variant: "destructive",
      });
    }
  };

  const cancelExtraction = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CANCEL' } as WorkerInMessage);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    
    setIsExtracting(false);
    setWorkerAlive(false);
    setFfmpegReady(false);
    setProgress(prev => ({ ...prev, status: 'cancelled' }));
    
    toast({
      title: "Extraction Cancelled",
      description: "Frame extraction has been stopped",
    });
  };

  // Get estimated frames for UI
  const estimatedFrames = metadata ? (() => {
    try {
      const estimate = estimateFramesAndZip(metadata, settings);
      return estimate.frames;
    } catch {
      return 0;
    }
  })() : 0;

  if (!file) {
    return null;
  }

  if (!metadata) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Loading...</h4>
              <p className="text-sm text-muted-foreground">
                Processing file metadata...
              </p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Analyzing file structure and properties</p>
            <p>• This should only take a moment</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">
              {isExtracting ? 'Extracting Frames...' : 'Ready to Extract'}
            </h4>
            <p className="text-sm text-muted-foreground">
              {frames.length} frames extracted • Original {metadata.width}×{metadata.height}
              {metadata.fps && ` • ${metadata.fps} FPS`}
            </p>
          </div>
        </div>

        {/* Extraction Button */}
        <div className="space-y-3">
          <Button
            onClick={isExtracting ? cancelExtraction : startExtraction}
            disabled={!file || !metadata || !ffmpegReady}
            size="lg"
            className="w-full"
          >
            {isExtracting ? (
              <>
                <Square className="w-4 h-4 mr-2" />
                Cancel Extraction
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Extract {estimatedFrames > 0 ? `${estimatedFrames.toLocaleString()} Frames` : 'Frames'}
              </>
            )}
          </Button>

          <Diagnostics 
            basePath={basePath}
            workerAlive={workerAlive}
            ffmpegReady={ffmpegReady}
            ffmpegInitMode={ffmpegInitMode}
            lastError={lastWorkerError}
          />
        </div>

        {/* Progress Bar */}
        {isExtracting && (
          <div className="space-y-2">
            <Progress value={progress.percent} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.percent.toFixed(1)}% complete</span>
              <span>{progress.frames} frames extracted</span>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {progress.status === 'error' && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            Error: {progress.error}
          </div>
        )}

        {progress.status === 'complete' && (frames.length > 0 || generatedParts.length > 0) && (
          <div className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-md">
            ✓ Extraction complete! {generatedParts.length > 0 ? `${generatedParts.length} ZIP parts` : `${frames.length} frames`} ready for download.
          </div>
        )}

        {/* Generated Parts */}
        {generatedParts.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Generated parts ({generatedParts.length})</div>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {generatedParts
                .sort((a, b) => a.partIndex - b.partIndex)
                .map(part => (
                  <li key={part.partIndex} className="flex items-center justify-between text-xs rounded-md border px-3 py-2">
                    <span className="font-mono">Part {part.partIndex}/{part.totalParts} — {part.filename}</span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      asChild
                    >
                      <a href={part.url} download={part.filename}>
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </a>
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Processing Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Files are processed entirely in your browser</p>
          <p>• Original resolution preserved</p>
          <p>• {settings.split?.enabled ? 'Split export reduces memory usage' : 'PNG format with lossless quality'}</p>
        </div>
      </div>
    </Card>
  );
}