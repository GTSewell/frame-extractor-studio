import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Zap, Cpu, Wrench, Sparkles } from 'lucide-react';
import type { ExtractionSettings } from '@/lib/types';

interface ProcessingModeSelectorProps {
  settings: ExtractionSettings;
  onChange: (settings: ExtractionSettings) => void;
}

const processingModes = [
  {
    value: 'auto',
    label: 'Auto (Recommended)',
    description: 'Automatically selects the fastest available method',
    icon: <Sparkles className="w-3 h-3" />,
    badge: 'Smart'
  },
  {
    value: 'webcodecs',
    label: 'WebCodecs',
    description: 'Native browser video decoding with hardware acceleration',
    icon: <Zap className="w-3 h-3" />,
    badge: 'Fast'
  },
  {
    value: 'image-decoder',
    label: 'ImageDecoder',
    description: 'Native browser image decoding for animated images (GIF, APNG)',
    icon: <Zap className="w-3 h-3" />,
    badge: 'Fast'
  },
  {
    value: 'ffmpeg',
    label: 'FFmpeg (WASM)',
    description: 'Universal WebAssembly-based processing with broad format support',
    icon: <Cpu className="w-3 h-3" />,
    badge: 'Universal'
  }
];

export function ProcessingModeSelector({ settings, onChange }: ProcessingModeSelectorProps) {
  const currentMode = processingModes.find(m => m.value === settings.processingMode) || processingModes[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="processing-mode" className="text-sm font-medium">
          Processing Engine
        </Label>
        <Badge 
          variant="secondary" 
          className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
        >
          {currentMode.icon}
          <span className="ml-1">{currentMode.badge}</span>
        </Badge>
      </div>
      
      <Select
        value={settings.processingMode}
        onValueChange={(value) => 
          onChange({ 
            ...settings, 
            processingMode: value as ExtractionSettings['processingMode']
          })
        }
      >
        <SelectTrigger id="processing-mode">
          <SelectValue>
            <div className="flex items-center gap-2">
              {currentMode.icon}
              <span>{currentMode.label}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {processingModes.map((mode) => (
            <SelectItem key={mode.value} value={mode.value}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  {mode.icon}
                  <div>
                    <div className="font-medium">{mode.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {mode.description}
                    </div>
                  </div>
                </div>
                <Badge 
                  variant="secondary" 
                  className="text-xs ml-2"
                >
                  {mode.badge}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <p className="text-xs text-muted-foreground">
        {currentMode.description}
      </p>
    </div>
  );
}