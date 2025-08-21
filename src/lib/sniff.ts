export type TrueType =
  | 'image/gif'
  | 'image/apng'
  | 'image/png'
  | 'image/webp'
  | 'video/mp4'
  | 'video/webm'
  | 'unknown';

export async function sniffTrueType(file: File): Promise<TrueType> {
  const buf = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const ascii = (i: number, n: number) => String.fromCharCode(...buf.slice(i, i + n));

  // GIF: "GIF8"
  if (ascii(0, 4) === 'GIF8') return 'image/gif';

  // PNG / APNG: "\x89PNG" and APNG has acTL chunk somewhere after IHDR
  if (buf[0] === 0x89 && ascii(1, 3) === 'PNG') {
    // search for 'acTL'
    for (let i = 12; i + 7 < buf.length; i++) {
      if (ascii(i + 4, 4) === 'acTL') return 'image/apng';
    }
    return 'image/png';
  }

  // WebP: "RIFF....WEBP"
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';

  // MP4: "....ftyp"
  if (ascii(4, 4) === 'ftyp') return 'video/mp4';

  // WebM: "....WEBM" in RIFF-like header (loose check)
  if (ascii(0, 4) === '\x1A\x45\xDF\xA3') return 'video/webm';

  return 'unknown';
}