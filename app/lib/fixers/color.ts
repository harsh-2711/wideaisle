// WCAG 2.x contrast maths and a lightness-only colour adjustment, so a fix
// keeps the brand's hue and saturation.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function toHex({ r, g, b }: RGB): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: RGB): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHsl({ r, g, b }: RGB): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 };
}

// The smallest lightness change to `fg` that reaches `target` contrast
// against `bg`, trying darker and lighter and keeping whichever moves less.
// Returns the colour unchanged when it already passes.
export function adjustForContrast(fg: RGB, bg: RGB, target = 4.5): RGB {
  if (contrast(fg, bg) >= target) return fg;
  const [h, s, l] = toHsl(fg);
  const search = (toward: 0 | 1): { color: RGB; delta: number } | null => {
    const end = fromHsl(h, s, toward);
    if (contrast(end, bg) < target) return null;
    let lo = l;
    let hi: number = toward;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (contrast(fromHsl(h, s, mid), bg) >= target) hi = mid;
      else lo = mid;
    }
    // Round to hex, then nudge until the rounded colour still passes.
    let lightness = hi;
    let color = parseHex(toHex(fromHsl(h, s, lightness)))!;
    for (let k = 0; k < 20 && contrast(color, bg) < target; k++) {
      lightness += toward === 0 ? -0.002 : 0.002;
      color = parseHex(toHex(fromHsl(h, s, Math.min(1, Math.max(0, lightness)))))!;
    }
    return { color, delta: Math.abs(lightness - l) };
  };
  const options = [search(0), search(1)].filter((o): o is { color: RGB; delta: number } => o !== null);
  if (!options.length) {
    // Neither direction reaches the target with this hue: use black or white.
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    return contrast(black, bg) >= contrast(white, bg) ? black : white;
  }
  options.sort((a, b) => a.delta - b.delta);
  return options[0].color;
}
