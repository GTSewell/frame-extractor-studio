import { useEffect, useState, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Zap, Cpu, Wrench } from 'lucide-react';
import type { 
  ExtractionSettings, 
  FileMetadata, 
  ExtractedFrame, 
  ExtractionProgress,
  WorkerInMessage,
  WorkerOutMessage,
  PartReady
} from '@/lib/types';
import { 
  selectOptimalEngine, 
  detectProcessingCapabilities, 
  getEngineDisplayName, 
  getEngineDescription,
  type ProcessingEngine 
} from '@/lib/processingMode';
import { useToast } from '@/hooks/use-toast';
import { extractAnimatedImageOnMain } from '@/lib/extractImage';
import FfmpegWorker from '@/workers/ffmpeg.worker?worker';
import ImageDecoderWorker from '@/workers/imageDecoder.worker?worker';
import WebCodecsWorker from '@/workers/webcodecs.worker?worker';

interface ProcessingControllerProps {
  file: File | null;
  metadata?: FileMetadata;
  settings: ExtractionSettings;
  onFramesExtracted?: (frames: ExtractedFrame[]) => void;
  onProgressUpdate?: (progress: ExtractionProgress) => void;
  onPartsReady?: (parts: Array<{
    partIndex: number;
    totalParts: number;
    startFrame: number;
    endFrame: number;
    filename: string;
    blob: Blob;
    url: string;
  }>) => void;
}

export function ProcessingController({
  file,
  metadata,
  settings,
  onFramesExtracted,
  onProgressUpdate,
  onPartsReady
}: ProcessingControllerProps) {
  const [selectedEngine, setSelectedEngine] = useState<ProcessingEngine>('ffmpeg');
  const [engineStatus, setEngineStatus] = useState<'detecting' | 'ready' | 'processing' | 'error'>('detecting');
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [parts, setParts] = useState<Array<{
    partIndex: number;
    totalParts: number;
    startFrame: number;
    endFrame: number;
    filename: string;
    blob: Blob;
    url: string;
  }>>([]);
  const [usingEngine, setUsingEngine] = useState<'imgdec'|'ffmpeg'|null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ffmpegRef = useRef<Worker | null>(null);
  
  const { toast } = useToast();
  const basePath = `${window.location.origin}${(import.meta as any).env?.BASE_URL ?? '/'}`.replace(/\/$/, '') + '/ffmpeg';

  // Detect capabilities and select engine when file changes
  useEffect(() => {
    if (!file) {
      setEngineStatus('detecting');
      return;
    }

    const detectAndSelect = async () => {
      try {
        setEngineStatus('detecting');
        
        const caps = await detectProcessingCapabilities(file, metadata);
        setCapabilities(caps);
        
        // Handle auto selection with true type routing
        let engine: ProcessingEngine;
        
        if (settings.processingMode === 'auto') {
          const tt = metadata?.trueType || file.type;
          if (tt === 'image/webp' || tt === 'image/gif' || tt === 'image/apng' || tt === 'image/png') {
            engine = 'image-decoder';
          } else if (tt === 'video/mp4' || tt === 'video/webm') {
            engine = 'ffmpeg';
          } else if (file.type.startsWith('image/')) {
            engine = 'image-decoder';
          } else {
            engine = 'ffmpeg';
          }
        } else {
          engine = await selectOptimalEngine(file, settings, metadata);
        }
        
        setSelectedEngine(engine);
        
        setEngineStatus('ready');
      } catch (error) {
        console.error('Error detecting processing capabilities:', error);
        setSelectedEngine('ffmpeg'); // Fallback
        setEngineStatus('error');
      }
    };

    detectAndSelect();
  }, [file, metadata, settings.processingMode]);

  // Create worker based on selected engine
  useEffect(() => {
    if (!file || engineStatus !== 'ready') return;

    let newWorker: Worker;

    switch (selectedEngine) {
      case 'image-decoder':
        newWorker = new ImageDecoderWorker();
        break;
      case 'webcodecs':
        newWorker = new WebCodecsWorker();
        break;
      case 'ffmpeg':
      default:
        newWorker = new FfmpegWorker();
        break;
    }

    newWorker.onmessage = (event: MessageEvent<WorkerOutMessage | any>) => {
      const { type } = event.data;
      
      switch (type) {
        case 'ALIVE':
          if (selectedEngine === 'ffmpeg') {
            // Initialize FFmpeg worker
            newWorker.postMessage({ type: 'INIT', basePath } as WorkerInMessage);
          }
          break;

        case 'ID_READY':
          // ImageDecoder worker is ready
          break;

        case 'FFMPEG_READY':
        case 'READY':
          // Worker is ready
          break;

        case 'PROGRESS':
          if (selectedEngine === 'image-decoder') {
            // ImageDecoder worker sends progress differently
            onProgressUpdate?.({
              frames: event.data.frames,
              percent: event.data.percent,
              status: 'processing'
            });
          } else {
            onProgressUpdate?.((event.data as any).progress);
          }
          break;

        case 'FRAME':
          if (selectedEngine === 'image-decoder') {
            const f = event.data.frame as { index: number; filename: string; timestamp: number; blob?: Blob; ab?: ArrayBuffer; mime: string };
            const blob = f.blob ?? new Blob([new Uint8Array(f.ab!)], { type: f.mime || 'image/png' });
            const url = URL.createObjectURL(blob);
            setFrames(prev => [...prev, { ...f, blob, url }]);
          } else {
            const frame = (event.data as any).frame;
            setFrames(prev => [...prev, frame]);
          }
          break;

        case 'PART_READY':
          const partData = event.data as PartReady;
          const partUrl = URL.createObjectURL(partData.zip);
          
          const newPart = {
            partIndex: partData.partIndex,
            totalParts: partData.totalParts,
            startFrame: partData.startFrame,
            endFrame: partData.endFrame,
            filename: partData.filename,
            blob: partData.zip,
            url: partUrl
          };
          
          setParts(prev => {
            const updated = [...prev, newPart];
            onPartsReady?.(updated);
            return updated;
          });

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
            description: `Part ${partData.partIndex}/${partData.totalParts} processed with ${getEngineDisplayName(selectedEngine)}`,
          });
          break;

        case 'COMPLETE':
          setEngineStatus('ready');
          onFramesExtracted?.(frames);
          
          toast({
            title: "Extraction Complete!",
            description: `Successfully extracted ${(event.data as any).totalFrames} frames using ${getEngineDisplayName(selectedEngine)}`,
          });
          break;

        case 'ERROR':
          // Auto-fallback for ImageDecoder errors (only for certain file types)
          if (selectedEngine === 'image-decoder' && file) {
            const tt = metadata?.trueType || file?.type || '';
            const allowFallback = tt !== 'image/webp' && tt !== 'image/gif' && tt !== 'image/apng';
            
            if (allowFallback) {
              toast({
                title: 'ImageDecoder Error',
                description: `${event.data.error}. Falling back to FFmpeg...`
              });
              
              // Terminate current worker
              newWorker.terminate();
              
              // Create FFmpeg worker as fallback
              const fallbackWorker = new FfmpegWorker();
              setSelectedEngine('ffmpeg');
            
            fallbackWorker.onmessage = (fallbackEvent: MessageEvent<WorkerOutMessage>) => {
              // Handle FFmpeg worker messages with same logic as above
              const { type: fallbackType } = fallbackEvent.data;
              
              switch (fallbackType) {
                case 'ALIVE':
                  fallbackWorker.postMessage({ type: 'INIT', basePath } as WorkerInMessage);
                  break;
                case 'FFMPEG_READY':
                  fallbackWorker.postMessage({
                    type: 'EXTRACT',
                    file,
                    settings,
                    metadata
                  } as WorkerInMessage);
                  break;
                case 'PROGRESS':
                  onProgressUpdate?.((fallbackEvent.data as any).progress);
                  break;
                case 'FRAME':
                  const fallbackFrame = (fallbackEvent.data as any).frame;
                  setFrames(prev => [...prev, fallbackFrame]);
                  break;
                case 'COMPLETE':
                  setEngineStatus('ready');
                  onFramesExtracted?.(frames);
                  toast({
                    title: "Extraction Complete!",
                    description: `Successfully extracted ${(fallbackEvent.data as any).totalFrames} frames using FFmpeg fallback`,
                  });
                  break;
                case 'ERROR':
                  setEngineStatus('error');
                  toast({
                    title: "Processing Failed",
                    description: `FFmpeg fallback error: ${(fallbackEvent.data as any).error}`,
                    variant: "destructive",
                  });
                  break;
              }
            };
            
              setWorker(fallbackWorker);
              return;
            } else {
              toast({
                title: 'ImageDecoder Error',
                description: event.data.error,
                variant: 'destructive'
              });
              setEngineStatus('error');
            }
          }
          
          setEngineStatus('error');
          toast({
            title: "Processing Failed",
            description: `${getEngineDisplayName(selectedEngine)} error: ${(event.data as any).error}`,
            variant: "destructive",
          });
          break;
      }
    };

    newWorker.onerror = (evt) => {
      // Never just log Event; fallback immediately with a clear reason
      if (selectedEngine === 'image-decoder') {
        toast({ 
          title: 'ImageDecoder crashed', 
          description: 'Falling back to FFmpeg…', 
          variant: 'destructive' 
        });
        newWorker.terminate();
        
        // Create FFmpeg worker as fallback
        const fallbackWorker = new FfmpegWorker();
        setSelectedEngine('ffmpeg');
        
        fallbackWorker.onmessage = (fallbackEvent: MessageEvent<WorkerOutMessage>) => {
          const { type: fallbackType } = fallbackEvent.data;
          
          switch (fallbackType) {
            case 'ALIVE':
              fallbackWorker.postMessage({ type: 'INIT', basePath } as WorkerInMessage);
              break;
            case 'FFMPEG_READY':
              fallbackWorker.postMessage({
                type: 'EXTRACT',
                file,
                settings,
                metadata
              } as WorkerInMessage);
              break;
            case 'PROGRESS':
              onProgressUpdate?.((fallbackEvent.data as any).progress);
              break;
            case 'PART_READY':
              const partData = fallbackEvent.data as PartReady;
              const partUrl = URL.createObjectURL(partData.zip);
              
              const newPart = {
                partIndex: partData.partIndex,
                totalParts: partData.totalParts,
                startFrame: partData.startFrame,
                endFrame: partData.endFrame,
                filename: partData.filename,
                blob: partData.zip,
                url: partUrl
              };
              
              setParts(prev => {
                const updated = [...prev, newPart];
                onPartsReady?.(updated);
                return updated;
              });
              break;
            case 'COMPLETE':
              setEngineStatus('ready');
              onFramesExtracted?.(frames);
              toast({
                title: "Extraction Complete!",
                description: `Successfully extracted ${(fallbackEvent.data as any).totalFrames} frames using FFmpeg fallback`,
              });
              break;
            case 'ERROR':
              setEngineStatus('error');
              toast({
                title: "Processing Failed",
                description: `FFmpeg fallback error: ${(fallbackEvent.data as any).error}`,
                variant: "destructive",
              });
              break;
          }
        };
        
        setWorker(fallbackWorker);
      } else {
        console.error('Worker error:', evt);
        setEngineStatus('error');
        toast({
          title: "Worker Error",
          description: `${getEngineDisplayName(selectedEngine)} worker failed to initialize`,
          variant: "destructive",
        });
      }
    };

    setWorker(newWorker);

    return () => {
      newWorker.terminate();
      
      // Clean up object URLs
      frames.forEach(frame => {
        if (frame.url) {
          URL.revokeObjectURL(frame.url);
        }
      });
      
      parts.forEach(part => {
        if (part.url) {
          URL.revokeObjectURL(part.url);
        }
      });
    };
  }, [selectedEngine, engineStatus, file]);

  const startImageOnMain = async (file: File, settings: ExtractionSettings, metadata: FileMetadata) => {
    setUsingEngine('imgdec');
    setEngineStatus('processing');
    setFrames([]);
    setParts([]);
    onProgressUpdate?.({ frames: 0, percent: 0, status: 'processing' });
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const out = settings.outputFormat?.type === 'jpeg' ? 'jpg' : 'png';
    const isCompressed = settings.outputFormat?.type === 'png-compressed';
    
    try {
      const total = await extractAnimatedImageOnMain({
        file,
        typeHint: metadata.trueType || file.type,
        nameBase: (metadata.name || file.name).replace(/\.[^.]+$/, ''),
        out,
        compressed: isCompressed,
        jpgQuality: (settings.outputFormat?.quality ?? 92) / 100,
        fpsHint: metadata.fps ?? 10,
        signal: abortRef.current.signal,
        onFrame: (i, blob, filename, ms) => {
          const url = URL.createObjectURL(blob);
          const frame = { index: i, filename, timestamp: ms, blob, url };
          setFrames(prev => [...prev, frame]);
        },
        onProgress: (done, total) => {
          onProgressUpdate?.({ frames: done, percent: Math.round((done/total)*100), status: 'processing' });
        },
      });
      
      setEngineStatus('ready');
      onProgressUpdate?.({ frames: total, percent: 100, status: 'complete' });
      onFramesExtracted?.(frames);
      
      toast({
        title: "Extraction Complete!",
        description: `Successfully extracted ${total} frames using ImageDecoder`,
      });
    } catch (e: any) {
      if (e?.message === 'Cancelled') return;
      setEngineStatus('error');
      toast({ 
        title: 'Image decode error', 
        description: e?.message || String(e), 
        variant: 'destructive' 
      });
    }
  };

  const startFfmpeg = (file: File, settings: ExtractionSettings, metadata: FileMetadata) => {
    setUsingEngine('ffmpeg');
    setEngineStatus('processing');
    setFrames([]);
    setParts([]);
    onProgressUpdate?.({ frames: 0, percent: 0, status: 'processing' });
    ffmpegRef.current?.terminate();
    const w = new FfmpegWorker();
    ffmpegRef.current = w;

    w.onmessage = (e: MessageEvent<any>) => {
      const { type } = e.data || {};
      if (type === 'ALIVE') {
        w.postMessage({ type: 'INIT', basePath });
      } else if (type === 'FFMPEG_READY') {
        w.postMessage({ type: 'EXTRACT', file, settings, metadata });
      } else if (type === 'PROGRESS') {
        onProgressUpdate?.({ 
          frames: e.data.progress?.frames ?? 0, 
          percent: e.data.progress?.percent ?? 0, 
          status: 'processing' 
        });
      } else if (type === 'FRAME') {
        const url = URL.createObjectURL(e.data.frame.blob);
        setFrames(prev => [...prev, { ...e.data.frame, url }]);
      } else if (type === 'PART_READY') {
        const partData = e.data as PartReady;
        const partUrl = URL.createObjectURL(partData.zip);
        
        const newPart = {
          partIndex: partData.partIndex,
          totalParts: partData.totalParts,
          startFrame: partData.startFrame,
          endFrame: partData.endFrame,
          filename: partData.filename,
          blob: partData.zip,
          url: partUrl
        };
        
        setParts(prev => {
          const updated = [...prev, newPart];
          onPartsReady?.(updated);
          return updated;
        });

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
          description: `Part ${partData.partIndex}/${partData.totalParts} processed with FFmpeg`,
        });
      } else if (type === 'COMPLETE') {
        setEngineStatus('ready');
        onFramesExtracted?.(frames);
        onProgressUpdate?.({ frames: e.data.totalFrames, percent: 100, status: 'complete' });
        toast({
          title: "Extraction Complete!",
          description: `Successfully extracted ${(e.data as any).totalFrames} frames using FFmpeg`,
        });
      } else if (type === 'ERROR') {
        setEngineStatus('error');
        toast({ 
          title: 'FFmpeg error', 
          description: e.data.error, 
          variant: 'destructive' 
        });
      }
    };

    w.onerror = (evt) => {
      setEngineStatus('error');
      toast({ 
        title: 'FFmpeg worker crashed', 
        description: 'See console for details', 
        variant: 'destructive' 
      });
    };

    setWorker(w);
  };

  const startExtraction = async () => {
    if (!file || !metadata) return;

    // Reset frames at the start of any extraction
    setFrames([]);
    setParts([]);
    onFramesExtracted?.([]);
    onProgressUpdate?.({ frames: 0, percent: 0, status: 'processing' });

    try {
      const tt = metadata.trueType || file.type;
      if (tt.startsWith('image/')) {
        await startImageOnMain(file, settings, metadata);
      } else {
        startFfmpeg(file, settings, metadata);
      }
    } catch (error) {
      console.error('Failed to start extraction:', error);
      setEngineStatus('error');
      toast({
        title: "Error",
        description: "Failed to start frame extraction",
        variant: "destructive",
      });
    }
  };

  const cancelExtraction = () => {
    abortRef.current?.abort();
    ffmpegRef.current?.postMessage({ type: 'CANCEL' });
    ffmpegRef.current?.terminate();
    
    if (worker) {
      worker.postMessage({ type: 'CANCEL' } as WorkerInMessage);
      worker.terminate();
      setWorker(null);
    }
    
    setFrames([]);
    setEngineStatus('ready');
    onProgressUpdate?.({ frames: 0, percent: 0, status: 'idle' });
    
    toast({
      title: "Extraction Cancelled",
      description: "Frame extraction has been stopped",
    });
  };

  const getEngineIcon = (engine: ProcessingEngine) => {
    switch (engine) {
      case 'image-decoder':
      case 'webcodecs':
        return <Zap className="w-3 h-3" />;
      case 'ffmpeg':
        return <Cpu className="w-3 h-3" />;
      default:
        return <Wrench className="w-3 h-3" />;
    }
  };

  const getStatusBadge = () => {
    switch (engineStatus) {
      case 'detecting':
        return (
          <Badge variant="secondary" className="text-xs">
            <AlertCircle className="w-3 h-3 mr-1" />
            Detecting capabilities...
          </Badge>
        );
      case 'ready':
        return (
          <Badge variant="default" className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
            {getEngineIcon(selectedEngine)}
            <span className="ml-1">{getEngineDisplayName(selectedEngine)}</span>
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="default" className="text-xs bg-blue-500/20 text-blue-300 border-blue-500/30">
            {getEngineIcon(selectedEngine)}
            <span className="ml-1">Processing with {getEngineDisplayName(selectedEngine)}</span>
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="text-xs">
            <AlertCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
    }
  };

  return {
    selectedEngine,
    engineStatus,
    capabilities,
    startExtraction,
    cancelExtraction,
    getStatusBadge,
    getEngineDescription: () => getEngineDescription(selectedEngine),
    frames,
    parts
  };
}