/**
 * Pure palette presentation model. Ported conceptually from Unity's
 * VHierarchyPalette.GetDefaultColor and VHierarchyGUI.backgroundColor.
 * No Editor/DOM dependencies: renderer and regression tests use the same math.
 */
namespace VHierarchyColors {
  export type Theme = 'dark' | 'light';
  export interface Options {
    colorSaturation: number;
    colorBrightness: number;
    colorGradientsEnabled: boolean;
  }
  type Rgb = [number, number, number];
  const bound = (n: number, min = 0, max = 1): number => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

  export function parseRgb(source: string): Rgb | null {
    const color = source.trim();
    const hex = /^#([a-f\d]{6}|[a-f\d]{3})$/i.exec(color);
    if (hex) {
      const chars = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
      return [0, 2, 4].map(index => Number.parseInt(chars.slice(index, index + 2), 16)) as Rgb;
    }
    const channels = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+)?\s*\)$/i.exec(color);
    if (!channels) return null;
    return [bound(+channels[1], 0, 255), bound(+channels[2], 0, 255), bound(+channels[3], 0, 255)];
  }

  export function detectTheme(colors: string[], hint = ''): Theme {
    if (/\blight\b/i.test(hint)) return 'light';
    if (/\bdark\b/i.test(hint)) return 'dark';
    for (const color of colors) {
      const rgb = parseRgb(color);
      if (!rgb) continue;
      // WCAG luminance is stable across custom editor themes.
      const linear = rgb.map(value => {
        const c = value / 255;
        return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
      });
      return (.2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]) > .36 ? 'light' : 'dark';
    }
    return 'dark';
  }

  function rgbToHsl([r8, g8, b8]: Rgb): [number, number, number] {
    const r = r8 / 255, g = g8 / 255, b = b8 / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d > 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h = ((h * 60) + 360) % 360;
    }
    return [h, s, l];
  }
  function hslToRgb(h: number, s: number, l: number): Rgb {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    const segments: Rgb[] = [[c,x,0], [x,c,0], [0,c,x], [0,x,c], [x,0,c], [c,0,x]];
    return segments[Math.floor(h / 60) % 6].map(channel => Math.round((channel + m) * 255)) as Rgb;
  }

  export function rgb(hex: string, theme: Theme, options: Options, inherited = false): Rgb {
    const source = parseRgb(hex);
    if (!source) return [0, 0, 0];
    const [h, originalS] = rgbToHsl(source);
    // Unity uses a neutral grey slot and 8 color slots, with brighter colors
    // in a light Editor theme. Saturation/brightness were previously ignored.
    const saturation = originalS < .07 ? 0 : bound((theme === 'dark' ? .45 : .62) * bound(options.colorSaturation, 0, 2));
    const lightness = bound((originalS < .07 ? (theme === 'dark' ? .38 : .88) : (theme === 'dark' ? .37 : .77)) * bound(options.colorBrightness, 0, 2));
    const [r,g,b] = hslToRgb(h, saturation, lightness);
    // Inherited colors are muted (as in Unity) to distinguish explicit row paint.
    if (!inherited) return [r,g,b];
    const neutral = theme === 'dark' ? 80 : 220;
    return [r,g,b].map(v => Math.round((v + neutral) / 2)) as Rgb;
  }

  export function rowBackground(hex: string, theme: Theme, options: Options, inherited = false, isGrey = false): string {
    const color = rgb(hex, theme, options, inherited);
    const alpha = (theme === 'dark' ? .17 : .13) * (inherited ? .68 : 1);
    const rgba = (a: number): string => `rgba(${color.join(',')},${Number(bound(a).toFixed(4))})`;
    // Grey remains flat, like Unity's VHierarchyGUI. Switchable gradient:
    // fade in near the left edge and fade out across the row's right side.
    if (isGrey || !options.colorGradientsEnabled)
      return `linear-gradient(${rgba(alpha)},${rgba(alpha)})`;
    return `linear-gradient(90deg,${rgba(0)} 0%,${rgba(alpha)} 9%,${rgba(alpha)} 35%,${rgba(alpha * .65)} 60%,${rgba(0)} 97%)`;
  }

  /** Selected rows must not inherit the native blue background-color.
   * Cocos 3.8.8 paints `--color-active-fill` under background images, so a
   * transparent tinted gradient alone cannot make the selected color visible.
   * Use a palette-derived *opaque* background and a color accent, retaining a
   * clear selection marker. This model stays independent of DOM/Cocos APIs. */
  export interface SelectedPaint {
    background: string;
    gradient: string;
    accent: string;
  }

  export function selectedRowPaint(hex: string, theme: Theme, options: Options, inherited = false): SelectedPaint {
    const color = rgb(hex, theme, options, inherited);
    const base: Rgb = theme === 'dark' ? [35, 42, 50] : [240, 243, 247];
    const factor = theme === 'dark' ? (inherited ? .47 : .68) : (inherited ? .34 : .51);
    const fill = base.map((v, i) => Math.round(v * (1 - factor) + color[i] * factor));
    const accentTarget: Rgb = theme === 'dark' ? [229, 237, 247] : [47, 54, 65];
    const accent = color.map((v, i) => Math.round(v * .72 + accentTarget[i] * .28));
    const rgba = (alpha: number): string => `rgba(${color.join(',')},${alpha})`;
    const gradient = options.colorGradientsEnabled
      ? `linear-gradient(90deg,${rgba(inherited ? .17 : .26)} 0%,${rgba(.1)} 70%,${rgba(.04)} 100%)`
      : `linear-gradient(${rgba(.1)},${rgba(.1)})`;
    return { background: `rgb(${fill.join(',')})`, gradient, accent: `rgb(${accent.join(',')})` };
  }

  export function swatch(hex: string, theme: Theme, options: Options): string {
    const c = rgb(hex, theme, options);
    return `rgb(${c.join(',')})`;
  }
}
