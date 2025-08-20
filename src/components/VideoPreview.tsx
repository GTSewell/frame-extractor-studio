import { useRef, useEffect, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { FileMetadata } from '@/lib/types';
import { PrintSizeDisplay } from './PrintSizeDisplay';

interface VideoPreviewProps {
  file: File;
  metadata?: FileMetadata;
  onMetadataLoad?: (metadata: FileMetadata) => void;
}

export function VideoPreview({ file, metadata, onMetadataLoad }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [url, setUrl] = useState<string>('');
  const [isGif, setIsGif] = useState(false);

  useEffect(() => {
    console.log('[VideoPreview] File loaded:', file.name, file.type);
    
    const videoUrl = URL.createObjectURL(file);
    setUrl(videoUrl);
    
    // Enhanced GIF/APNG detection
    const fileName = file.name.toLowerCase();
    const isGifFile = fileName.endsWith('.gif') || file.type === 'image/gif';
    const isApngFile = fileName.endsWith('.apng') || fileName.endsWith('.png');
    
    console.log('[VideoPreview] File detection:', { isGifFile, isApngFile, fileName, mimeType: file.type });
    
    setIsGif(isGifFile || isApngFile);
    
    // For GIF/APNG files, don't call onMetadataLoad here, wait for handleImageLoad

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

  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    
    console.log('[VideoPreview] Image loaded, extracting metadata');
    
    const extractedMetadata: FileMetadata = {
      duration: 0, // GIFs don't have a reliable duration in the browser
      width: img.naturalWidth,
      height: img.naturalHeight,
      fps: file.name.toLowerCase().endsWith('.gif') ? 10 : 24,
      codec: undefined,
      size: file.size,
      name: file.name
    };
    
    console.log('[VideoPreview] Image metadata extracted:', extractedMetadata);
    console.log('[VideoPreview] Image dimensions:', extractedMetadata.width, 'x', extractedMetadata.height);
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
        {isGif ? (
          <img
            ref={imgRef}
            src={url}
            alt="Preview"
            className="w-full h-full object-contain"
            onLoad={handleImageLoad}
            onError={(e) => {
              console.error('[VideoPreview] Image error:', e);
              // Try to extract metadata anyway if possible
              if (imgRef.current && imgRef.current.naturalWidth > 0) {
                handleImageLoad();
              }
            }}
          />
        ) : (
          <video
            ref={videoRef}
            src={url}
            className="w-full h-full object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={(e) => console.error('[VideoPreview] Video error:', e)}
            preload="metadata"
          />
        )}
        
        {/* Overlay controls - only show for videos */}
        {!isGif && (
          <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <Button
              size="lg"
              variant="secondary"
              className="bg-black/50 hover:bg-black/70 text-white border-0"
              onClick={handlePlayPause}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </Button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Timeline - only show for videos */}
        {!isGif && (
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
        )}

        {/* Controls - only show for videos */}
        {!isGif && (
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
        )}

        {/* Metadata */}
        {metadata && (
          <div className="pt-4 border-t border-border space-y-4">
            <div className="grid grid-cols-2 gap-4 text-caption">
              <div>
                <span className="text-muted-foreground">Dimensions:</span>
                <span className="ml-2 font-medium">{metadata.width} × {metadata.height}</span>
              </div>
              {!isGif && (
                <div>
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="ml-2 font-medium">{formatTime(metadata.duration)}</span>
                </div>
              )}
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
            
            {/* Print Size Display */}
            <PrintSizeDisplay width={metadata.width} height={metadata.height} />
          </div>
        )}
      </div>
    </Card>
  );
}