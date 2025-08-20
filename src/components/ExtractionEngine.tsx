import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { X, Download, Pause, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { 
  FileMetadata, 
  ExtractionSettings, 
  ExtractedFrame, 
  ExtractionProgress,
  WorkerInMessage,
  WorkerOutMessage 
} from '@/lib/types';

interface ExtractionEngineProps {
  file: File | null;
  metadata?: FileMetadata;
  settings: ExtractionSettings;
  onFramesExtracted: (frames: ExtractedFrame[]) => void;
  onProgressUpdate: (progress: ExtractionProgress) => void;
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
  const workerRef = useRef<Worker | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      // Clean up worker on unmount
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      // Clean up frame URLs
      frames.forEach(frame => URL.revokeObjectURL(frame.url));
    };
  }, [frames]);

  const initializeWorker = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    workerRef.current = new Worker(
      new URL('../lib/ffmpeg/worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const { type } = event.data;
      console.log('[ExtractionEngine] Worker message:', type);

      switch (type) {
        case 'READY':
          console.log('[ExtractionEngine] FFmpeg worker ready');
          toast({
            title: "FFmpeg Ready",
            description: "Extraction engine initialized successfully."
          });
          break;

        case 'META':
          console.log('[ExtractionEngine] Metadata received:', event.data.metadata);
          break;

        case 'PROGRESS':
          const newProgress = event.data.progress;
          console.log('[ExtractionEngine] Progress update:', newProgress);
          setProgress(newProgress);
          onProgressUpdate(newProgress);
          break;

        case 'FRAME':
          const frame = event.data.frame;
          console.log('[ExtractionEngine] Frame received:', frame.index);
          setFrames(prev => [...prev, frame]);
          break;

        case 'COMPLETE':
          console.log('[ExtractionEngine] Extraction complete:', event.data.totalFrames);
          setProgress(prev => ({ ...prev, status: 'complete', percent: 100 }));
          setIsExtracting(false);
          toast({
            title: "Extraction Complete",
            description: `Successfully extracted ${event.data.totalFrames} frames`
          });
          break;

        case 'ERROR':
          const errorMsg = event.data as { type: 'ERROR'; error: string };
          console.error('[ExtractionEngine] Worker error:', errorMsg.error);
          setProgress(prev => ({ ...prev, status: 'error', error: errorMsg.error }));
          setIsExtracting(false);
          toast({
            title: "Extraction Failed",
            description: errorMsg.error,
            variant: "destructive"
          });
          break;
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('Worker error:', error);
      setIsExtracting(false);
      setProgress(prev => ({ ...prev, status: 'error', error: 'Worker failed' }));
      toast({
        title: "Worker Error",
        description: "Failed to initialize extraction worker",
        variant: "destructive"
      });
    };

    // Initialize worker
    workerRef.current.postMessage({ type: 'INIT' } as WorkerInMessage);
  };

  const startExtraction = async () => {
    if (!file || !metadata) {
      console.log('[ExtractionEngine] Missing file or metadata:', { file: !!file, metadata: !!metadata });
      return;
    }
    
    console.log('[ExtractionEngine] Starting extraction...', { file: file.name, settings });
    
    setIsExtracting(true);
    setFrames([]);
    setProgress({ frames: 0, percent: 0, status: 'processing' });
    
    toast({
      title: "Starting extraction...",
      description: "Initializing FFmpeg and processing your file."
    });
    
    try {
      // Initialize worker if needed
      if (!workerRef.current) {
        console.log('[ExtractionEngine] Creating new worker...');
        initializeWorker();
        // Wait for worker to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Send extraction command
      console.log('[ExtractionEngine] Sending EXTRACT command to worker...');
      workerRef.current?.postMessage({
        type: 'EXTRACT',
        file,
        settings
      } as WorkerInMessage);
    } catch (error) {
      console.error('[ExtractionEngine] Failed to start extraction:', error);
      toast({
        title: "Extraction Failed",
        description: error instanceof Error ? error.message : "Failed to start extraction",
        variant: "destructive"
      });
      setProgress({
        frames: 0,
        percent: 0,
        status: 'error',
        error: 'Failed to start extraction'
      });
      setIsExtracting(false);
    }
  };

  const cancelExtraction = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CANCEL' } as WorkerInMessage);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsExtracting(false);
    setProgress({ frames: 0, percent: 0, status: 'cancelled' });
    // Clean up extracted frames
    frames.forEach(frame => URL.revokeObjectURL(frame.url));
    setFrames([]);
  };

  // Update parent with extracted frames
  useEffect(() => {
    onFramesExtracted(frames);
  }, [frames, onFramesExtracted]);

  if (!file || !metadata) {
    return null;
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
              {progress.frames} frames • Original {metadata.width}×{metadata.height}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {isExtracting ? (
              <Button 
                onClick={cancelExtraction}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <X size={16} />
                Cancel
              </Button>
            ) : (
              <Button 
                onClick={startExtraction}
                className="bg-gradient-brand hover:opacity-90 text-brand-foreground font-semibold flex items-center gap-2"
                size="lg"
                disabled={!file || !metadata}
              >
                <Play size={16} />
                Extract Frames
              </Button>
            )}
          </div>
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
            Error: {progress.error}
          </div>
        )}

        {progress.status === 'complete' && frames.length > 0 && (
          <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950/20 p-3 rounded-md">
            ✓ Extraction complete! {frames.length} frames ready for download.
          </div>
        )}

        {/* Processing Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Files are processed entirely in your browser</p>
          <p>• Original resolution preserved</p>
          <p>• PNG format with lossless quality</p>
        </div>
      </div>
    </Card>
  );
}