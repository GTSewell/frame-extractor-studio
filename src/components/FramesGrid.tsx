import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Download, CheckSquare, X } from 'lucide-react';
import type { ExtractedFrame } from '@/lib/types';

interface FramesGridProps {
  frames: ExtractedFrame[];
  onDownloadSelected: (frames: ExtractedFrame[]) => void;
  onDownloadAll: () => void;
}

export function FramesGrid({ frames, onDownloadSelected, onDownloadAll }: FramesGridProps) {
  const [selectedFrames, setSelectedFrames] = useState<Set<number>>(new Set());

  if (frames.length === 0) {
    return null;
  }

  const toggleFrameSelection = (index: number) => {
    setSelectedFrames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedFrames(new Set(frames.map((_, i) => i)));
  };

  const clearSelection = () => {
    setSelectedFrames(new Set());
  };

  const downloadSingleFrame = (frame: ExtractedFrame) => {
    const link = document.createElement('a');
    link.href = frame.url;
    link.download = frame.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSelected = () => {
    const selected = frames.filter((_, i) => selectedFrames.has(i));
    onDownloadSelected(selected);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-title flex items-center gap-2">
              Extracted Frames
              <Badge variant="secondary">{frames.length}</Badge>
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedFrames.size > 0 ? `${selectedFrames.size} selected` : 'Click frames to select'}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={selectAll}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <CheckSquare size={16} />
              Select All
            </Button>
            
            {selectedFrames.size > 0 && (
              <Button
                onClick={clearSelection}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <X size={16} />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Download Actions */}
        <div className="flex items-center gap-2 pb-4 border-b border-border">
          <Button
            onClick={onDownloadAll}
            className="bg-gradient-brand hover:opacity-90 text-brand-foreground font-semibold flex items-center gap-2"
          >
            <Download size={16} />
            Download All as ZIP
          </Button>
          
          {selectedFrames.size > 0 && (
            <Button
              onClick={handleDownloadSelected}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download size={16} />
              Download Selected ({selectedFrames.size})
            </Button>
          )}
        </div>

        {/* Frames Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {frames.map((frame, index) => (
            <div key={frame.index} className="relative group">
              {/* Selection Checkbox */}
              <div className="absolute top-2 left-2 z-10">
                <Checkbox
                  checked={selectedFrames.has(index)}
                  onCheckedChange={() => toggleFrameSelection(index)}
                  className="bg-background/80 backdrop-blur-sm"
                />
              </div>
              
              {/* Frame Image */}
              <div 
                className={`relative aspect-video bg-muted rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                  selectedFrames.has(index) 
                    ? 'border-brand ring-2 ring-brand/20' 
                    : 'border-transparent hover:border-border'
                }`}
                onClick={() => toggleFrameSelection(index)}
              >
                <img
                  src={frame.url}
                  alt={`Frame ${frame.index}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    console.error('Failed to load frame image:', frame.filename, frame.url);
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement?.appendChild(
                      Object.assign(document.createElement('div'), {
                        className: 'w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs',
                        textContent: 'Failed to load'
                      })
                    );
                  }}
                />
                
                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadSingleFrame(frame);
                    }}
                    size="sm"
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <Download size={14} />
                    Download
                  </Button>
                </div>
              </div>
              
              {/* Frame Info */}
              <div className="mt-2 text-xs text-muted-foreground space-y-1">
                <div className="font-mono">#{frame.index.toString().padStart(3, '0')}</div>
                <div>{formatTime(frame.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}