import { useRef, useEffect, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { FileMetadata } from '@/lib/types';

interface VideoPreviewProps {
  file: File;
  metadata?: FileMetadata;
  onMetadataLoad?: (metadata: FileMetadata) => void;
}

export function VideoPreview({ file, metadata, onMetadataLoad }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    const videoUrl = URL.createObjectURL(file);
    setUrl(videoUrl);

    return () => {
      URL.revokeObjectURL(videoUrl);
    };
  }, [file]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    const extractedMetadata: FileMetadata = {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      fps: undefined, // Will be estimated later if needed
      codec: undefined,
      size: file.size,
      name: file.name
    };

    setDuration(video.duration);
    onMetadataLoad?.(extractedMetadata);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newTime = (value[0] / 100) * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleReset = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = 0;
    setCurrentTime(0);
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  const progressPercentage = duration ? (currentTime / duration) * 100 : 0;

  return (
    <Card className="overflow-hidden bg-surface">
      <div className="aspect-video bg-black rounded-t-lg overflow-hidden relative">
        <video
          ref={videoRef}
          src={url}
          className="w-full h-full object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          preload="metadata"
        />
        
        {/* Overlay controls */}
        <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity duration-smooth flex items-center justify-center">
          <Button
            size="lg"
            variant="secondary"
            className="bg-black/50 hover:bg-black/70 text-white border-0"
            onClick={handlePlayPause}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Timeline */}
        <div className="space-y-2">
          <Slider
            value={[progressPercentage]}
            onValueChange={handleSeek}
            className="w-full"
            step={0.1}
            max={100}
          />
          
          <div className="flex items-center justify-between text-caption text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePlayPause}
            className="flex items-center gap-2"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            className="flex items-center gap-2"
          >
            <RotateCcw size={16} />
            Reset
          </Button>
        </div>

        {/* Metadata */}
        {metadata && (
          <div className="pt-4 border-t border-border">
            <div className="grid grid-cols-2 gap-4 text-caption">
              <div>
                <span className="text-muted-foreground">Dimensions:</span>
                <span className="ml-2 font-medium">{metadata.width} × {metadata.height}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duration:</span>
                <span className="ml-2 font-medium">{formatTime(metadata.duration)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Size:</span>
                <span className="ml-2 font-medium">
                  {(metadata.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Format:</span>
                <span className="ml-2 font-medium">{file.type}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}