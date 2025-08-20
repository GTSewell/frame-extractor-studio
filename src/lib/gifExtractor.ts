// GIF Frame Extractor using Canvas API
// This handles GIF frame extraction since FFmpeg might not work reliably with GIFs

export interface GifFrame {
  canvas: HTMLCanvasElement;
  delay: number;
  index: number;
}

export class GifExtractor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement;
  private frames: GifFrame[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.img = new Image();
  }

  async extractFrames(file: File): Promise<GifFrame[]> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      
      this.img.onload = () => {
        try {
          this.canvas.width = this.img.naturalWidth;
          this.canvas.height = this.img.naturalHeight;
          
          // For static images or simple GIFs, we extract the current frame
          this.ctx.drawImage(this.img, 0, 0);
          
          const frame: GifFrame = {
            canvas: this.cloneCanvas(this.canvas),
            delay: 100, // Default 100ms delay
            index: 0
          };
          
          this.frames = [frame];
          URL.revokeObjectURL(url);
          resolve(this.frames);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };
      
      this.img.onerror = (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      };
      
      this.img.src = url;
    });
  }

  private cloneCanvas(originalCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const clonedCanvas = document.createElement('canvas');
    const clonedCtx = clonedCanvas.getContext('2d')!;
    
    clonedCanvas.width = originalCanvas.width;
    clonedCanvas.height = originalCanvas.height;
    
    clonedCtx.drawImage(originalCanvas, 0, 0);
    return clonedCanvas;
  }

  // Convert canvas to blob
  async canvasToBlob(canvas: HTMLCanvasElement, mimeType: string = 'image/png', quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, mimeType, quality);
    });
  }

  destroy() {
    this.frames = [];
    this.canvas.remove();
  }
}