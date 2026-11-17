/**
 * Local import boundary: only sanitized SVG or PNG/WebP images are decoded,
 * then rasterized into a 96px transparent PNG. Never persist user-supplied SVG
 * markup, external URLs, object URLs, filename paths or active content.
 */
namespace VHierarchyIconFiles {
  export interface PreparedIcon { name: string; dataUrl: string; }
  const MAX_UPLOAD_BYTES = 512 * 1024;
  const MAX_SOURCE_DIMENSION = 4096;
  const OUTPUT_DIMENSION = 96;
  const SAFE_ELEMENTS = new Set(['svg','g','path','circle','rect','line','ellipse','polyline','polygon','title','desc']);

  export function safeSvg(xml: string): boolean {
    if (!xml || xml.length > MAX_UPLOAD_BYTES || !/<svg(?:\s|>)/i.test(xml)) return false;
    // No external resource loading, entity expansion, DOM event handlers or
    // executable/style content, even if browsers normally isolate <img> SVG.
    if (/<!|<\?|&(?:#|[a-z])|\bon[a-z]+\s*=|\b(?:href|src|style|filter)\s*=|(?:url\s*\(|javascript\s*:|data\s*:)/i.test(xml)) return false;
    const names = /<\s*\/?\s*([a-z][a-z0-9:-]*)\b[^>]*>/gi;
    let match: RegExpExecArray | null;
    let count = 0;
    while ((match = names.exec(xml))) {
      if (!SAFE_ELEMENTS.has(match[1].toLowerCase())) return false;
      if (++count > 2000) return false;
    }
    return count >= 2 && /<\/svg\s*>\s*$/i.test(xml);
  }

  export function importName(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '').replace(/[\x00-\x1f\x7f<>\\/]/g, '').trim().slice(0,48);
  }

  export async function rasterize(file: File): Promise<PreparedIcon> {
    if (!file || file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new Error('Icon file must be 1–512 KB');
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['png','webp','svg'].includes(ext || '')) throw new Error('Choose a PNG, WebP or SVG file');
    let blob: Blob = file;
    if (ext === 'svg') {
      const xml = await file.text();
      if (!safeSvg(xml)) throw new Error('SVG contains unsafe or unsupported markup (paths and shapes only)');
      blob = new Blob([xml], {type:'image/svg+xml'});
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const candidate = new Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = () => reject(new Error('Image could not be decoded'));
        candidate.src = url;
      });
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth > MAX_SOURCE_DIMENSION || img.naturalHeight > MAX_SOURCE_DIMENSION)
        throw new Error('Image dimensions must be between 1 and 4096 pixels');
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_DIMENSION; canvas.height = OUTPUT_DIMENSION;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D Canvas unavailable in Editor');
      const ratio = Math.min(88 / img.naturalWidth, 88 / img.naturalHeight);
      const width = img.naturalWidth * ratio, height = img.naturalHeight * ratio;
      ctx.clearRect(0,0,OUTPUT_DIMENSION,OUTPUT_DIMENSION);
      ctx.drawImage(img,(OUTPUT_DIMENSION-width)/2,(OUTPUT_DIMENSION-height)/2,width,height);
      const dataUrl = canvas.toDataURL('image/png');
      if (!/^data:image\/png;base64,/.test(dataUrl)) throw new Error('Canvas PNG export failed');
      return {name: importName(file.name) || 'Custom icon', dataUrl};
    } finally { URL.revokeObjectURL(url); }
  }
}
