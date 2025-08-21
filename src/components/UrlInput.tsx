import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Download, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UrlInputProps {
  onFileFromUrl: (file: File) => void;
  disabled?: boolean;
}

export function UrlInput({ onFileFromUrl, disabled }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleUrlSubmit = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    try {
      // Fetch the file from URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Determine filename from URL or content-disposition header
      let filename = 'download';
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      } else {
        const urlPath = new URL(url).pathname;
        const urlFilename = urlPath.split('/').pop();
        if (urlFilename && urlFilename.includes('.')) {
          filename = urlFilename;
        }
      }

      // Ensure we have a proper extension
      if (!filename.includes('.')) {
        const contentType = response.headers.get('content-type') || blob.type;
        if (contentType.includes('gif')) filename += '.gif';
        else if (contentType.includes('webp')) filename += '.webp';
        else if (contentType.includes('png')) filename += '.png';
        else if (contentType.includes('mp4')) filename += '.mp4';
        else if (contentType.includes('webm')) filename += '.webm';
      }

      // Create File object
      const file = new File([blob], filename, { type: blob.type });
      
      onFileFromUrl(file);
      setUrl('');
      
      toast({
        title: "File loaded from URL",
        description: `Successfully loaded ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`,
      });
    } catch (error) {
      console.error('Error fetching URL:', error);
      toast({
        title: "Failed to load from URL",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUrlSubmit();
    }
  };

  return (
    <Card className="p-4 border-dashed">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe size={16} />
          <span>Load from URL</span>
        </div>
        
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder="https://example.com/animation.gif"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={disabled || isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleUrlSubmit}
            disabled={disabled || isLoading || !url.trim()}
            size="sm"
            className="flex items-center gap-2"
          >
            <Download size={16} />
            {isLoading ? 'Loading...' : 'Load'}
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Supports GIF, WebP, APNG, MP4, and WebM files from direct URLs
        </p>
      </div>
    </Card>
  );
}