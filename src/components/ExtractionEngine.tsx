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
  ExtractionProgress
} from '@/lib/types';
import { estimateFramesAndZip } from '@/lib/estimate';
import Diagnostics from '@/components/Diagnostics';
import { ProcessingController } from '@/components/ProcessingController';

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
  const [progress, setProgress] = useState<ExtractionProgress>({
    frames: 0,
    percent: 0,
    status: 'idle'
  });
  const [generatedParts, setGeneratedParts] = useState<Array<{
    partIndex: number;
    totalParts: number;
    startFrame: number;
    endFrame: number;
    filename: string;
    blob: Blob;
    url: string;
  }>>([]);

  const { toast } = useToast();
  
  const controller = ProcessingController({
    file,
    metadata,
    settings,
    onFramesExtracted,
    onProgressUpdate: (prog) => {
      setProgress(prog);
      onProgressUpdate?.(prog);
    },
    onPartsReady: setGeneratedParts
  });

  const isExtracting = controller.engineStatus === 'processing';

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
              {controller.frames.length} frames extracted • Original {metadata.width}×{metadata.height}
              {metadata.fps && ` • ${metadata.fps} FPS`}
            </p>
          </div>
        </div>

        {/* Extraction Button */}
        <div className="space-y-3">
          <Button
            onClick={isExtracting ? controller.cancelExtraction : controller.startExtraction}
            disabled={!file || !metadata || controller.engineStatus === 'detecting'}
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

          <div className="flex flex-col gap-2">
            {controller.getStatusBadge()}
            {controller.engineStatus === 'ready' && (
              <p className="text-xs text-muted-foreground">
                {controller.getEngineDescription()}
              </p>
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
            <AlertCircle className="w-4 h-4 inline mr-2" />
            Error: {progress.error}
          </div>
        )}

        {progress.status === 'complete' && (controller.frames.length > 0 || generatedParts.length > 0) && (
          <div className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-md">
            ✓ Extraction complete! {generatedParts.length > 0 ? `${generatedParts.length} ZIP parts` : `${controller.frames.length} frames`} ready for download.
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