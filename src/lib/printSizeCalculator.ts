// Print Size Calculator for FRAMED
// Calculates physical dimensions and quality recommendations based on resolution and DPI

export interface PrintSize {
  dpi: number;
  width: {
    inches: number;
    cm: number;
  };
  height: {
    inches: number;
    cm: number;
  };
  quality: 'Web' | 'Print Ready' | 'High Quality Print' | 'Professional Print';
  recommended: boolean;
}

export function calculatePrintSizes(widthPx: number, heightPx: number): PrintSize[] {
  const dpiValues = [72, 150, 200, 300, 600];
  
  return dpiValues.map(dpi => {
    const widthInches = widthPx / dpi;
    const heightInches = heightPx / dpi;
    const widthCm = widthInches * 2.54;
    const heightCm = heightInches * 2.54;
    
    let quality: PrintSize['quality'];
    let recommended = false;
    
    if (dpi <= 72) {
      quality = 'Web';
    } else if (dpi <= 150) {
      quality = 'Print Ready';
    } else if (dpi <= 200) {
      quality = 'Print Ready';
      recommended = true;
    } else if (dpi <= 300) {
      quality = 'High Quality Print';
      recommended = true;
    } else {
      quality = 'Professional Print';
    }
    
    return {
      dpi,
      width: {
        inches: Math.round(widthInches * 100) / 100,
        cm: Math.round(widthCm * 10) / 10
      },
      height: {
        inches: Math.round(heightInches * 100) / 100,
        cm: Math.round(heightCm * 10) / 10
      },
      quality,
      recommended
    };
  });
}

export function formatDimensions(size: PrintSize): string {
  return `${size.width.inches}" × ${size.height.inches}" (${size.width.cm} × ${size.height.cm} cm)`;
}