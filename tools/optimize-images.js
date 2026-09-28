#!/usr/bin/env node
/**
 * Turns a source photo into web-ready files in assets/img.
 * Usage: node tools/optimize-images.js <source.jpg> <slot> [width]
 * Writes <slot>.jpg and <slot>.webp.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SLOTS = {
  hero: 1600,
  texture: 900,
  workshop: 1400,
};

const [source, slot, widthArg] = process.argv.slice(2);
if (!source || !slot) {
  console.error('Usage: node tools/optimize-images.js <source.jpg> <slot> [width]');
  process.exit(1);
}
if (!fs.existsSync(source)) {
  console.error(`Source not found: ${source}`);
  process.exit(1);
}

const width = parseInt(widthArg, 10) || SLOTS[slot] || 1400;
const outDir = path.join(__dirname, '..', 'assets', 'img');
fs.mkdirSync(outDir, { recursive: true });

const jpg = path.join(outDir, `${slot}.jpg`);
const webp = path.join(outDir, `${slot}.webp`);

execFileSync('magick', [source, '-auto-orient', '-resize', `${width}x>`, '-strip', '-quality', '82', jpg]);
execFileSync('magick', [source, '-auto-orient', '-resize', `${width}x>`, '-strip', '-quality', '78', webp]);
console.log(`Wrote ${path.relative(process.cwd(), jpg)} and ${path.relative(process.cwd(), webp)}`);
