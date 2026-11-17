/**
 * Custom icon identity and PNG validation. Pure functions, independent from
 * Cocos, Electron and filesystem APIs. Custom icons are project-local files.
 */
export interface CustomIcon { id: string; name: string; }
export const MAX_CUSTOM_ICONS = 64;
export const MAX_ICON_PNG_BYTES = 160 * 1024;
export const MAX_ICON_CANVAS_DIMENSION = 256;
const CUSTOM_ICON_PATTERN = /^custom:[0-9a-f]{20}$/;
export const isCustomIcon = (value: unknown): value is string =>
  typeof value === 'string' && CUSTOM_ICON_PATTERN.test(value);

export function cleanIconName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC')
    .replace(/[\x00-\x1f\x7f<>\\/]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 48);
}

/** PNG files must be actual nonzero-size PNGs; their bytes are never executed. */
export function isValidPng(bytes: Uint8Array): boolean {
  if (bytes.length < 45 || bytes.length > MAX_ICON_PNG_BYTES) return false;
  const magic = [137,80,78,71,13,10,26,10];
  if (!magic.every((n, i) => bytes[i] === n)) return false;
  if (bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) return false;
  const size = (at: number): number => ((bytes[at] << 24) | (bytes[at+1] << 16) | (bytes[at+2] << 8) | bytes[at+3]) >>> 0;
  if (size(8) !== 13) return false; // IHDR must be first, 13 bytes
  const width = size(16), height = size(20);
  if (!width || !height || width > MAX_ICON_CANVAS_DIMENSION || height > MAX_ICON_CANVAS_DIMENSION) return false;
  const colorType = bytes[25];
  if (![0,2,3,4,6].includes(colorType) || ![1,2,4,8,16].includes(bytes[24])) return false;
  // Must contain IDAT (raster data) and IEND. PNG chunk checksums are
  // checked by Chromium when decoding the supplied image data.
  const ascii = Array.from(bytes.slice(26)).map(b => String.fromCharCode(b)).join('');
  return ascii.includes('IDAT') && ascii.includes('IEND');
}

export function sanitizeCustomIcons(input: unknown): CustomIcon[] {
  if (!Array.isArray(input)) return [];
  const ids = new Set<string>();
  const result: CustomIcon[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const name = cleanIconName(item.name);
    if (!isCustomIcon(item.id) || !name || ids.has(item.id)) continue;
    result.push({id: item.id, name}); ids.add(item.id);
    if (result.length >= MAX_CUSTOM_ICONS) break;
  }
  return result;
}
