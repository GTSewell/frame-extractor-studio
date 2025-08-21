import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileImage } from 'lucide-react';
import type { ExtractedFrame } from '@/lib/types';

interface FramesGridProps {
  frames: ExtractedFrame[];
  onDownloadSelected: (frames: ExtractedFrame[]) => void;
  onDownloadAll: () => void;
}

export function FramesGrid({ frames, onDownloadAll }: FramesGridProps) {
  if (frames.length === 0) {
    return null;
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Calculate total estimated size (rough estimate)
  const estimatedTotalSize = frames.length * 1024 * 512; // ~512KB per frame estimate
  const firstFrame = frames[0];
  const lastFrame = frames[frames.length - 1];

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-title flex items-center gap-2">
              <FileImage size={20} />
              Frames Extracted Successfully
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Ready to download as ZIP archive
            </p>
          </div>
          <Badge variant="secondary" className="text-lg px-3 py-1">
            {frames.length} frames
          </Badge>
        </div>

        {/* Summary Card */}
        <div className="bg-muted/30 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Frame count:</span>
              <div className="font-semibold">{frames.length} frames</div>
            </div>
            <div>
              <span className="text-muted-foreground">Estimated size:</span>
              <div className="font-semibold">{formatFileSize(estimatedTotalSize)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Frame range:</span>
              <div className="font-semibold">#{firstFrame.index} - #{lastFrame.index}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Format:</span>
              <div className="font-semibold">{firstFrame.filename.split('.').pop()?.toUpperCase()}</div>
            </div>
          </div>
        </div>

        {/* Download Section */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={onDownloadAll}
            className="bg-gradient-brand hover:opacity-90 text-brand-foreground font-semibold flex items-center gap-2 flex-1"
            size="lg"
          >
            <Download size={18} />
            Download All Frames as ZIP
          </Button>
        </div>

        {/* Additional Info */}
        <div className="text-xs text-muted-foreground bg-muted/20 rounded p-3">
          <p className="flex items-center gap-2">
            <FileImage size={14} />
            All frames are saved with original quality and timestamp information.
          </p>
        </div>
      </div>
    </Card>
  );
}