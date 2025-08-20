import { useState } from 'react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ExtractedFrame, FileMetadata } from '@/lib/types';

interface DownloadZipProps {
  frames: ExtractedFrame[];
  metadata?: FileMetadata;
  basename: string;
}

export function DownloadZip({ frames, metadata, basename }: DownloadZipProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const createAndDownloadZip = async (framesToZip: ExtractedFrame[]) => {
    if (framesToZip.length === 0) return;

    setIsCreating(true);
    setProgress(0);

    try {
      const zip = new JSZip();
      
      // Add frames to zip
      for (let i = 0; i < framesToZip.length; i++) {
        const frame = framesToZip[i];
        
        // Convert blob to array buffer
        const arrayBuffer = await frame.blob.arrayBuffer();
        
        // Add to zip with the generated filename
        zip.file(frame.filename, arrayBuffer);
        
        // Update progress
        setProgress(((i + 1) / framesToZip.length) * 80); // 80% for adding files
      }
      
      // Generate zip file
      setProgress(85);
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      setProgress(95);
      
      // Generate filename
      const dimensions = metadata ? `${metadata.width}x${metadata.height}` : '';
      const zipFilename = `${basename}_frames${dimensions ? '_' + dimensions : ''}_${framesToZip.length}.zip`;
      
      // Download zip
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setProgress(100);
      
      toast({
        title: "ZIP Created Successfully",
        description: `Downloaded ${framesToZip.length} frames as ${zipFilename}`
      });
      
    } catch (error) {
      console.error('Error creating ZIP:', error);
      toast({
        title: "ZIP Creation Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  if (frames.length === 0) return null;

  const estimatedSize = frames.length * 512 * 1024; // Rough estimate: 512KB per frame
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-4">
      {isCreating && (
        <div className="space-y-2">
          <Progress value={progress} className="w-full" />
          <div className="text-xs text-muted-foreground text-center">
            Creating ZIP file... {progress.toFixed(0)}%
          </div>
        </div>
      )}
      
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Package size={16} />
        <span>Estimated ZIP size: {formatSize(estimatedSize)}</span>
      </div>
    </div>
  );
}

// Hook for external components to trigger ZIP creation
export function useDownloadZip() {
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const createZip = async (frames: ExtractedFrame[], basename: string, metadata?: FileMetadata) => {
    if (frames.length === 0) return;

    setIsCreating(true);
    setProgress(0);

    try {
      const zip = new JSZip();
      
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const arrayBuffer = await frame.blob.arrayBuffer();
        zip.file(frame.filename, arrayBuffer);
        setProgress(((i + 1) / frames.length) * 80);
      }
      
      setProgress(85);
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      setProgress(95);
      
      const dimensions = metadata ? `${metadata.width}x${metadata.height}` : '';
      const zipFilename = `${basename}_frames${dimensions ? '_' + dimensions : ''}_${frames.length}.zip`;
      
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setProgress(100);
      
      toast({
        title: "ZIP Created Successfully",
        description: `Downloaded ${frames.length} frames as ${zipFilename}`
      });
      
    } catch (error) {
      console.error('Error creating ZIP:', error);
      toast({
        title: "ZIP Creation Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  return { createZip, isCreating, progress };
}