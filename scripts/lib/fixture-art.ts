import bwipjs from 'bwip-js/node';
import { createCanvas, loadImage, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';

export type Symbol2D = { bcid: string; text: string; scale?: number; parse?: boolean; version?: string };

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function renderSymbol(s: Symbol2D): Promise<Canvas> {
  const png = await bwipjs.toBuffer({ bcid: s.bcid, text: s.text, scale: s.scale ?? 4, parse: s.parse ?? false, ...(s.version ? { version: s.version } : {}) });
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

export function blankCanvas(width: number, height: number, fill = '#fff'): { canvas: Canvas; g: SKRSContext2D } {
  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  g.fillStyle = fill;
  g.fillRect(0, 0, width, height);
  return { canvas, g };
}

export function withQuietZone(symbol: Canvas, margin: number): Canvas {
  const { canvas, g } = blankCanvas(symbol.width + 2 * margin, symbol.height + 2 * margin);
  g.drawImage(symbol, margin, margin);
  return canvas;
}

export function rotated(symbol: Canvas, degrees: number): Canvas {
  const size = Math.ceil(Math.hypot(symbol.width, symbol.height)) + 40;
  const { canvas, g } = blankCanvas(size, size);
  g.translate(size / 2, size / 2);
  g.rotate((degrees * Math.PI) / 180);
  g.drawImage(symbol, -symbol.width / 2, -symbol.height / 2);
  return canvas;
}

export function inverted(symbol: Canvas): Canvas {
  const c = withQuietZone(symbol, 20);
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'difference';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function damaged(symbol: Canvas, moduleSize: number, fraction: number, seed: number): Canvas {
  const c = withQuietZone(symbol, 20);
  const g = c.getContext('2d');
  const rnd = seededRandom(seed);
  const modules = symbol.width / moduleSize;
  const flips = Math.round(fraction * modules * modules);
  for (let i = 0; i < flips; i++) {
    g.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
    const mx = 1 + Math.floor(rnd() * (modules - 2));
    const my = 1 + Math.floor(rnd() * (modules - 2));
    g.fillRect(20 + mx * moduleSize, 20 + my * moduleSize, moduleSize, moduleSize);
  }
  return c;
}

// Trapezoid perspective (drawn in vertical strips), blur, uneven lighting and
// sensor noise: a cheap stand-in for a phone photo of a label.
export function photoLike(symbol: Canvas, seed: number): Canvas {
  const rnd = seededRandom(seed);
  const w = symbol.width * 2;
  const h = symbol.height * 2;
  const { canvas, g } = blankCanvas(w, h, '#e8e2d6');
  g.filter = 'blur(0.6px)';
  const x0 = w * 0.25;
  const strips = symbol.width;
  for (let i = 0; i < strips; i++) {
    const t = i / strips;
    const stripH = symbol.height * (1 - 0.18 * t);
    const y = h * 0.25 + (symbol.height - stripH) / 2 + 12 * t;
    g.drawImage(symbol, i, 0, 1, symbol.height, x0 + i * 0.95, y, 1, stripH);
  }
  g.filter = 'none';
  const light = g.createLinearGradient(0, 0, w, h);
  light.addColorStop(0, 'rgba(255,255,255,0.25)');
  light.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = light;
  g.fillRect(0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  for (let i = 0; i < px.data.length; i += 4) {
    const n = (rnd() - 0.5) * 40;
    for (let k = 0; k < 3; k++) px.data[i + k] = Math.max(0, Math.min(255, (px.data[i + k] ?? 0) + n));
  }
  g.putImageData(px, 0, 0);
  return canvas;
}

// Busy content without any code: colored blocks, lines and text.
export function codeFreeScene(width: number, height: number, seed: number): Canvas {
  const rnd = seededRandom(seed);
  const { canvas, g } = blankCanvas(width, height);
  const blocks = Math.round((width * height) / 4000);
  for (let i = 0; i < blocks; i++) {
    g.fillStyle = `hsl(${Math.floor(rnd() * 360)},${30 + Math.floor(rnd() * 50)}%,${20 + Math.floor(rnd() * 70)}%)`;
    g.fillRect(rnd() * width, rnd() * height, 4 + rnd() * width * 0.05, 4 + rnd() * height * 0.05);
  }
  g.fillStyle = '#111';
  g.font = `${Math.max(12, Math.round(height / 60))}px sans-serif`;
  for (let y = 30; y < height; y += Math.round(height / 25)) {
    g.fillText('Invoice 2024-0042 · Qty 3 · Unit 19,99 EUR · Total 59,97 EUR · Thank you for your order', 20, y);
  }
  return canvas;
}

export function textPage(width: number, height: number): Canvas {
  const { canvas, g } = blankCanvas(width, height);
  g.fillStyle = '#111';
  const size = Math.max(10, Math.round(width / 110));
  g.font = `${size}px sans-serif`;
  for (let y = size * 3; y < height - size * 2; y += Math.round(size * 1.5)) {
    g.fillText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore 12.345,00', size * 3, y);
  }
  return canvas;
}

export function placeAt(target: Canvas, symbol: Canvas, x: number, y: number): Canvas {
  target.getContext('2d').drawImage(symbol, x, y);
  return target;
}
