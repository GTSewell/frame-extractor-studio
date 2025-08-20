import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileDropzone } from '@/components/FileDropzone';
import { VideoPreview } from '@/components/VideoPreview';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Info, Shield, Github } from 'lucide-react';
import { FileMetadata, ExtractionSettings, DEFAULT_SETTINGS } from '@/lib/types';

export default function Index() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<FileMetadata>();
  const [settings, setSettings] = useState<ExtractionSettings>(DEFAULT_SETTINGS);
  const [estimatedFrames, setEstimatedFrames] = useState(0);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setMetadata(undefined);
    // Reset estimation when new file is selected
    setEstimatedFrames(0);
  };

  const handleMetadataLoad = (meta: FileMetadata) => {
    setMetadata(meta);
    // Simple frame estimation based on mode
    let frameCount = 0;
    if (settings.mode === 'every') {
      frameCount = Math.floor(meta.duration * (meta.fps || 24));
    } else if (settings.mode === 'fps' && settings.fps) {
      frameCount = Math.floor(meta.duration * settings.fps);
    } else if (settings.mode === 'nth' && settings.nth) {
      const totalFrames = Math.floor(meta.duration * (meta.fps || 24));
      frameCount = Math.floor(totalFrames / settings.nth);
    }
    setEstimatedFrames(Math.min(frameCount, settings.maxFrames));
  };

  const handleExtract = () => {
    if (!selectedFile || !metadata) return;
    // TODO: Implement extraction logic with web worker
    console.log('Extracting frames...', { selectedFile, metadata, settings });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-headline font-bold tracking-tight">
                FRAMED
              </h1>
              <Badge variant="outline" className="text-xs">
                Beta
              </Badge>
            </div>
            
            <nav className="flex items-center gap-4">
              <Button asChild variant="ghost" size="sm">
                <Link to="/about" className="flex items-center gap-2">
                  <Info size={16} />
                  About
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/privacy" className="flex items-center gap-2">
                  <Shield size={16} />
                  Privacy
                </Link>
              </Button>
              <Button 
                asChild 
                variant="outline" 
                size="sm"
                className="hidden sm:flex"
              >
                <a 
                  href="https://github.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <Github size={16} />
                  GitHub
                </a>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="space-y-8">
          {/* Hero Section */}
          <section className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="text-display font-bold tracking-tight bg-gradient-brand bg-clip-text text-transparent">
              Extract frames at size
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Fast, privacy-first frame extraction from MP4, WebM, GIF, and APNG files. 
              All processing happens locally in your browser.
            </p>
          </section>

          {/* Upload Section */}
          <section className="max-w-4xl mx-auto">
            <FileDropzone 
              onFileSelect={handleFileSelect}
              disabled={false}
            />
          </section>

          {/* Preview and Settings */}
          {selectedFile && (
            <div className="grid lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
              {/* Preview */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-title mb-4">Preview</h3>
                  <VideoPreview
                    file={selectedFile}
                    metadata={metadata}
                    onMetadataLoad={handleMetadataLoad}
                  />
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-6">
                <SettingsPanel
                  settings={settings}
                  onSettingsChange={setSettings}
                  metadata={metadata}
                  estimatedFrames={estimatedFrames}
                  estimatedSize={estimatedFrames * 1024 * 512} // Rough estimate
                />

                {/* Extract Button */}
                {metadata && (
                  <Card className="p-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">Ready to extract</h4>
                          <p className="text-sm text-muted-foreground">
                            {estimatedFrames} frames • Original {metadata.width}×{metadata.height}
                          </p>
                        </div>
                        <Button 
                          onClick={handleExtract}
                          className="bg-gradient-brand hover:opacity-90 text-brand-foreground font-semibold"
                          size="lg"
                        >
                          Extract Frames
                        </Button>
                      </div>
                      
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>• Files are processed entirely in your browser</p>
                        <p>• Original resolution preserved</p>
                        <p>• PNG format with lossless quality</p>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Features */}
          {!selectedFile && (
            <section className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-3 gap-6">
                <Card className="p-6 text-center">
                  <div className="w-12 h-12 bg-brand/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Shield className="text-brand" size={24} />
                  </div>
                  <h3 className="text-title mb-2 text-lg">Privacy First</h3>
                  <p className="text-muted-foreground">
                    Your files never leave your device. Everything runs locally using WebAssembly.
                  </p>
                </Card>

                <Card className="p-6 text-center">
                  <div className="w-12 h-12 bg-brand/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <svg className="text-brand" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="18" height="18" x="3" y="3" rx="2" />
                      <path d="M9 9h6v6H9z" />
                    </svg>
                  </div>
                  <h3 className="text-title mb-2 text-lg">Original Quality</h3>
                  <p className="text-muted-foreground">
                    Frames extracted "at size" - preserving exact pixel dimensions and quality.
                  </p>
                </Card>

                <Card className="p-6 text-center">
                  <div className="w-12 h-12 bg-brand/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <svg className="text-brand" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <h3 className="text-title mb-2 text-lg">Multiple Formats</h3>
                  <p className="text-muted-foreground">
                    Supports MP4, WebM, GIF, and APNG with intelligent frame detection.
                  </p>
                </Card>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              © 2024 FRAMED. Built with privacy in mind.
            </div>
            <div className="flex items-center gap-4 text-sm">
              <Link to="/about" className="text-muted-foreground hover:text-foreground transition-colors">
                About
              </Link>
              <Link to="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                Privacy
              </Link>
              <a 
                href="https://github.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}