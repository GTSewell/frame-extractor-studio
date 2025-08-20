import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Settings } from 'lucide-react';
import { ExtractionSettings, FileMetadata, DEFAULT_SETTINGS } from '@/lib/types';
import { ProcessingModeSelector } from '@/components/ProcessingModeSelector';

interface SettingsPanelProps {
  settings: ExtractionSettings;
  onSettingsChange: (settings: ExtractionSettings) => void;
  metadata?: FileMetadata;
  estimatedFrames?: number;
  estimatedSize?: number;
}

export function SettingsPanel({ 
  settings, 
  onSettingsChange, 
  metadata, 
  estimatedFrames = 0,
  estimatedSize = 0 
}: SettingsPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleModeChange = (mode: ExtractionSettings['mode']) => {
    onSettingsChange({ ...settings, mode });
  };

  const handleFpsChange = (value: number[]) => {
    onSettingsChange({ ...settings, fps: value[0] });
  };

  const handleNthChange = (value: string) => {
    const nth = parseInt(value);
    if (!isNaN(nth) && nth > 0) {
      onSettingsChange({ ...settings, nth });
    }
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const timeInSeconds = parseTimeString(value);
    onSettingsChange({ 
      ...settings, 
      [field]: timeInSeconds >= 0 ? timeInSeconds : undefined 
    });
  };

  const handleMaxFramesChange = (value: string) => {
    const maxFrames = parseInt(value);
    if (!isNaN(maxFrames) && maxFrames > 0) {
      onSettingsChange({ ...settings, maxFrames });
    }
  };

  const handleNamingChange = (field: keyof ExtractionSettings['naming'], value: string) => {
    onSettingsChange({
      ...settings,
      naming: { ...settings.naming, [field]: field === 'padLength' ? parseInt(value) || 6 : value }
    });
  };

  const handleOutputFormatChange = (type: ExtractionSettings['outputFormat']['type']) => {
    onSettingsChange({
      ...settings,
      outputFormat: { ...settings.outputFormat, type }
    });
  };

  const handleQualityChange = (value: number[]) => {
    onSettingsChange({
      ...settings,
      outputFormat: { ...settings.outputFormat, quality: value[0] }
    });
  };

  const parseTimeString = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts.map(p => parseFloat(p) || 0);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return parseFloat(timeStr) || 0;
  };

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.padStart(6, '0')}`;
  };

  const isOverLimit = estimatedFrames > settings.maxFrames;
  const estimatedSizeMB = estimatedSize / (1024 * 1024);

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings size={20} />
        <h3 className="text-title">Extraction Settings</h3>
      </div>

      {/* Processing Engine */}
      <ProcessingModeSelector 
        settings={settings}
        onChange={onSettingsChange}
      />

      {/* Extraction Mode */}
      <div className="space-y-3">
        <Label>Extraction Mode</Label>
        <Select value={settings.mode} onValueChange={handleModeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="every">Every Frame</SelectItem>
            <SelectItem value="fps">By FPS</SelectItem>
            <SelectItem value="nth">Every Nth Frame</SelectItem>
            <SelectItem value="range">Time Range</SelectItem>
          </SelectContent>
        </Select>

        {/* Mode-specific settings */}
        {settings.mode === 'fps' && (
          <div className="space-y-2">
            <Label>Target FPS: {settings.fps || 1}</Label>
            <Slider
              value={[settings.fps || 1]}
              onValueChange={handleFpsChange}
              min={1}
              max={60}
              step={1}
              className="w-full"
            />
          </div>
        )}

        {settings.mode === 'nth' && (
          <div className="space-y-2">
            <Label htmlFor="nth">Extract every Nth frame</Label>
            <Input
              id="nth"
              type="number"
              value={settings.nth || 1}
              onChange={(e) => handleNthChange(e.target.value)}
              min={1}
              placeholder="10"
            />
          </div>
        )}

        {settings.mode === 'range' && metadata && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time (HH:MM:SS.SSS)</Label>
              <Input
                id="startTime"
                value={settings.startTime ? formatTime(settings.startTime) : '00:00:00.000'}
                onChange={(e) => handleTimeChange('startTime', e.target.value)}
                placeholder="00:00:00.000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time (HH:MM:SS.SSS)</Label>
              <Input
                id="endTime"
                value={settings.endTime ? formatTime(settings.endTime) : formatTime(metadata.duration)}
                onChange={(e) => handleTimeChange('endTime', e.target.value)}
                placeholder={formatTime(metadata.duration)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Advanced Settings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Advanced Settings</Label>
          <Switch
            checked={showAdvanced}
            onCheckedChange={setShowAdvanced}
          />
        </div>

        {showAdvanced && (
          <div className="space-y-4 p-4 rounded-lg bg-surface border border-border">
            {/* Split Export */}
            <div className="space-y-3">
              <Label>Split Export (recommended for large jobs)</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={settings.split?.enabled || false}
                  onCheckedChange={(enabled) => {
                    const bytesPerFrameMid = metadata ? 
                      (metadata.width * metadata.height * 0.9) : // rough estimate
                      (1920 * 1080 * 0.9);
                    const recommended = Math.max(100, Math.min(2000, Math.floor(500 * 1024 * 1024 / bytesPerFrameMid) || 250));
                    
                    onSettingsChange({
                      ...settings,
                      split: {
                        enabled,
                        framesPerPart: enabled ? (settings.split?.framesPerPart || recommended) : 250,
                        autoDownload: settings.split?.autoDownload ?? true,
                        previewThumbnails: settings.split?.previewThumbnails ?? false
                      }
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  Reduce memory usage for large extractions
                </span>
              </div>
              
              {settings.split?.enabled && (
                <div className="space-y-3 p-3 rounded-lg bg-muted/30">
                  <div className="space-y-2">
                    <Label htmlFor="framesPerPart">Frames per ZIP part</Label>
                    <Input
                      id="framesPerPart"
                      type="number"
                      value={settings.split.framesPerPart}
                      onChange={(e) => {
                        const framesPerPart = Math.max(100, parseInt(e.target.value) || 250);
                        onSettingsChange({
                          ...settings,
                          split: { ...settings.split!, framesPerPart }
                        });
                      }}
                      min={100}
                      max={2000}
                    />
                    <div className="text-xs text-muted-foreground">
                      Higher values = fewer ZIP files but more memory usage
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={settings.split.autoDownload ?? true}
                      onCheckedChange={(autoDownload) => {
                        onSettingsChange({
                          ...settings,
                          split: { ...settings.split!, autoDownload }
                        });
                      }}
                    />
                    <Label className="text-sm">Auto-download parts as ready</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={settings.split.previewThumbnails ?? false}
                      onCheckedChange={(previewThumbnails) => {
                        onSettingsChange({
                          ...settings,
                          split: { ...settings.split!, previewThumbnails }
                        });
                      }}
                    />
                    <Label className="text-sm">Show thumbnails while exporting</Label>
                  </div>
                  
                  <div className="text-xs text-muted-foreground bg-info/10 p-2 rounded">
                    💡 Split export creates multiple ZIP files and reduces browser memory usage during large extractions.
                  </div>
                </div>
              )}
            </div>

            {/* Output Format */}
            <div className="space-y-3">
              <Label>Output Format</Label>
              <Select 
                value={settings.outputFormat.type} 
                onValueChange={handleOutputFormatChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG (Lossless)</SelectItem>
                  <SelectItem value="jpeg">JPEG (Compressed)</SelectItem>
                  <SelectItem value="png-compressed">PNG (Compressed)</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Quality slider for JPEG */}
              {settings.outputFormat.type === 'jpeg' && (
                <div className="space-y-2">
                  <Label>JPEG Quality: {settings.outputFormat.quality || 90}%</Label>
                  <Slider
                    value={[settings.outputFormat.quality || 90]}
                    onValueChange={handleQualityChange}
                    min={10}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
              )}
              
              {/* Format advice */}
              <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                {settings.outputFormat.type === 'png' && '💡 PNG: Best for graphics, text, transparency. Larger files.'}
                {settings.outputFormat.type === 'jpeg' && '💡 JPEG: Best for photos. Smaller files, no transparency.'}
                {settings.outputFormat.type === 'png-compressed' && '💡 PNG Compressed: Balanced size/quality for NFTs and web.'}
              </div>
            </div>

            {/* Max Frames Limit */}
            <div className="space-y-2">
              <Label htmlFor="maxFrames">Max Frames Limit</Label>
              <Input
                id="maxFrames"
                type="number"
                value={settings.maxFrames}
                onChange={(e) => handleMaxFramesChange(e.target.value)}
                min={1}
                max={10000}
              />
            </div>

            {/* Naming Pattern */}
            <div className="space-y-2">
              <Label htmlFor="namingPattern">Filename Pattern</Label>
              <Input
                id="namingPattern"
                value={settings.naming.pattern}
                onChange={(e) => handleNamingChange('pattern', e.target.value)}
                placeholder="{basename}_f{frame}"
              />
              {/* Naming Preview */}
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <span className="font-mono">Preview: </span>
                <span className="font-mono">
                  {settings.naming.pattern
                    .replace('{basename}', metadata?.name?.split('.')[0] || 'video')
                    .replace('{frame}', '1'.padStart(settings.naming.padLength, '0'))
                    .replace('{timestamp_ms}', '0')}.{settings.outputFormat.type === 'jpeg' ? 'jpg' : 'png'}
                </span>
              </div>
            </div>

            {/* Padding Length */}
            <div className="space-y-2">
              <Label htmlFor="padLength">Frame Number Padding</Label>
              <Input
                id="padLength"
                type="number"
                value={settings.naming.padLength}
                onChange={(e) => handleNamingChange('padLength', e.target.value)}
                min={1}
                max={10}
              />
            </div>
          </div>
        )}
      </div>

      {/* Estimation */}
      {metadata && estimatedFrames > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-caption">Estimated Output:</span>
            <div className="text-right">
              <div className="text-caption font-medium">
                {estimatedFrames.toLocaleString()} frames
              </div>
              <div className="text-xs text-muted-foreground">
                ~{estimatedSizeMB.toFixed(1)} MB ZIP
              </div>
            </div>
          </div>

          {isOverLimit && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle size={16} className="text-warning mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-warning">Exceeds frame limit</p>
                <p className="text-muted-foreground">
                  Consider adjusting your settings to reduce the frame count, or increase the limit in advanced settings.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}