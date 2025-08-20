import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Privacy() {
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
          <h1 className="text-headline">Privacy Policy</h1>
        </div>

        <div className="space-y-6">
          <Card className="p-8">
            <h2 className="text-title mb-4">Our Commitment to Privacy</h2>
            <p className="text-body text-muted-foreground leading-relaxed">
              FRAMED is designed with privacy as a core principle. We believe your creative work 
              should remain private and secure, which is why we've built our application to process 
              everything locally on your device.
            </p>
          </Card>

          <Card className="p-8">
            <h2 className="text-title mb-4">What Data We DON'T Collect</h2>
            <ul className="text-body text-muted-foreground space-y-3 leading-relaxed">
              <li className="flex items-start gap-3">
                <span className="text-success font-bold">✓</span>
                <span><strong>Your Files:</strong> All uploaded files are processed entirely within your browser. They never leave your device or reach our servers.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-success font-bold">✓</span>
                <span><strong>Personal Information:</strong> We don't require accounts, emails, or any personal information to use FRAMED.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-success font-bold">✓</span>
                <span><strong>File Content:</strong> We have no access to the content of your files, extracted frames, or any metadata.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-success font-bold">✓</span>
                <span><strong>Usage Analytics:</strong> Currently, we don't collect any usage analytics or tracking data.</span>
              </li>
            </ul>
          </Card>

          <Card className="p-8">
            <h2 className="text-title mb-4">How It Works</h2>
            <div className="space-y-4 text-body text-muted-foreground leading-relaxed">
              <p>
                FRAMED uses modern web technologies to process your files entirely within your browser:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• <strong>WebAssembly (WASM):</strong> Runs FFmpeg locally for video processing</li>
                <li>• <strong>Web Workers:</strong> Handles processing in the background without freezing your browser</li>
                <li>• <strong>Local Storage:</strong> Only your settings preferences are saved locally (not your files)</li>
              </ul>
              <p>
                When you close your browser tab, all traces of your files are automatically cleared from memory.
              </p>
            </div>
          </Card>

          <Card className="p-8">
            <h2 className="text-title mb-4">Data We May Collect in the Future</h2>
            <p className="text-body text-muted-foreground leading-relaxed mb-4">
              If we ever introduce optional analytics or error reporting, we will:
            </p>
            <ul className="text-body text-muted-foreground space-y-2 leading-relaxed ml-4">
              <li>• Ask for your explicit consent</li>
              <li>• Provide clear opt-out mechanisms</li>
              <li>• Only collect anonymous, non-identifying usage data</li>
              <li>• Update this privacy policy with clear details</li>
            </ul>
          </Card>

          <Card className="p-8">
            <h2 className="text-title mb-4">Third-Party Services</h2>
            <p className="text-body text-muted-foreground leading-relaxed">
              FRAMED currently uses minimal third-party services. The web fonts (Inter) are loaded 
              from Google Fonts, which may set cookies according to Google's privacy policy. All 
              core functionality works entirely offline after the initial page load.
            </p>
          </Card>

          <Card className="p-8">
            <h2 className="text-title mb-4">Security</h2>
            <p className="text-body text-muted-foreground leading-relaxed">
              Since all processing happens locally, your files are as secure as your own device. 
              We recommend keeping your browser updated and running FRAMED on trusted devices for 
              maximum security.
            </p>
          </Card>

          <Card className="p-8 bg-gradient-surface">
            <h2 className="text-title mb-4">Questions?</h2>
            <p className="text-body text-muted-foreground leading-relaxed">
              This privacy policy was last updated on {new Date().toLocaleDateString()}. If you have 
              any questions about our privacy practices or this policy, please feel free to reach out 
              through our GitHub repository.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}