import { Badge } from '@/components/ui/badge';
import { calculatePrintSizes, formatDimensions, PrintSize } from '@/lib/printSizeCalculator';

interface PrintSizeDisplayProps {
  width: number;
  height: number;
}

export function PrintSizeDisplay({ width, height }: PrintSizeDisplayProps) {
  if (width <= 0 || height <= 0) return null;

  const printSizes = calculatePrintSizes(width, height);
  const recommendedSizes = printSizes.filter(size => size.recommended);
  
  return (
    <div className="space-y-3">
      <h4 className="text-caption font-medium">Print Size Reference</h4>
      
      {/* Recommended sizes first */}
      {recommendedSizes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Recommended for printing:</div>
          {recommendedSizes.map((size) => (
            <div key={size.dpi} className="flex items-center justify-between">
              <span className="text-xs font-mono">
                {formatDimensions(size)}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {size.dpi} DPI
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {size.quality}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* All sizes */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          View all print sizes
        </summary>
        <div className="mt-2 space-y-1">
          {printSizes.map((size) => (
            <div key={size.dpi} className="flex items-center justify-between py-1">
              <span className="font-mono">
                {formatDimensions(size)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{size.dpi} DPI</span>
                <span className="text-muted-foreground">({size.quality})</span>
              </div>
            </div>
          ))}
        </div>
      </details>
      
      <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
        💡 For best results: 200+ DPI for photos, 300+ DPI for text/graphics
      </div>
    </div>
  );
}