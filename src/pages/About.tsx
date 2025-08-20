import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Zap, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-4 mb-8">
          <Button asChild variant="outline" size="sm">
            <Link to="/" className="flex items-center gap-2">
              <ArrowLeft size={16} />
              Back
            </Link>
          </Button>
          <h1 className="text-headline">About FRAMED</h1>
        </div>

        <div className="space-y-6">
          <Card className="p-8">
            <h2 className="text-title mb-4">What is FRAMED?</h2>
            <p className="text-body text-muted-foreground leading-relaxed">
              FRAMED is a fast, minimalist web application that extracts individual frames from 
              animations and videos. Upload your MP4, WebM, GIF, or APNG file and download all 
              frames as high-quality PNG images at their original resolution.
            </p>
          </Card>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="w-12 h-12 bg-brand/10 rounded-lg flex items-center justify-center mb-4">
                <Shield className="text-brand" size={24} />
              </div>
              <h3 className="text-title mb-2 text-lg">Privacy First</h3>
              <p className="text-body text-muted-foreground">
                Your files never leave your device. All processing happens locally in your browser 
                using WebAssembly technology.
              </p>
            </Card>

            <Card className="p-6">
              <div className="w-12 h-12 bg-brand/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="text-brand" size={24} />
              </div>
              <h3 className="text-title mb-2 text-lg">Lightning Fast</h3>
              <p className="text-body text-muted-foreground">
                Powered by FFmpeg.wasm running in web workers, ensuring smooth performance 
                without blocking your browser.
              </p>
            </Card>

            <Card className="p-6">
              <div className="w-12 h-12 bg-brand/10 rounded-lg flex items-center justify-center mb-4">
                <Download className="text-brand" size={24} />
              </div>
              <h3 className="text-title mb-2 text-lg">Original Quality</h3>
              <p className="text-body text-muted-foreground">
                Frames are extracted "at size" — preserving the original pixel dimensions 
                and quality of your source file.
              </p>
            </Card>
          </div>

          <Card className="p-8">
            <h2 className="text-title mb-4">What does "at size" mean?</h2>
            <p className="text-body text-muted-foreground leading-relaxed mb-4">
              When we say frames are extracted "at size," we mean they maintain the exact pixel 
              dimensions of your original file. No resizing, no compression artifacts — just 
              pixel-perfect PNG frames ready for your creative projects.
            </p>
            <p className="text-body text-muted-foreground leading-relaxed">
              For example, a 1920×1080 video will produce 1920×1080 PNG frames. A 640×480 GIF 
              will produce 640×480 frames. This ensures maximum quality and compatibility with 
              professional workflows.
            </p>
          </Card>

          <Card className="p-8">
            <h2 className="text-title mb-4">Supported Formats</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Video Formats</h4>
                <ul className="text-body text-muted-foreground space-y-1">
                  <li>• MP4 (H.264, H.265)</li>
                  <li>• WebM (VP8, VP9, AV1)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Animation Formats</h4>
                <ul className="text-body text-muted-foreground space-y-1">
                  <li>• GIF (Animated)</li>
                  <li>• APNG (Animated PNG)</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-8 bg-gradient-surface">
            <h2 className="text-title mb-4">Browser Compatibility</h2>
            <p className="text-body text-muted-foreground leading-relaxed">
              FRAMED works best in modern browsers that support WebAssembly and Web Workers. 
              We recommend using the latest versions of Chrome, Edge, Firefox, or Safari for 
              optimal performance.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}