/**
 * Generates the PWA / favicon rasters from the logo geometry.
 *   npm run assets
 * Output is committed (public/icons, public/apple-touch-icon.png) so deployment needs no build-time image step.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const out = path.join(root, "public");
mkdirSync(path.join(out, "icons"), { recursive: true });

const INK = "#0f3d3a";
const DOOR = "#f4efe4";
const BRASS = "#b8893b";

/** The mark artwork on a 64 unit grid, without the background tile. */
const artwork = `
  <path d="M19 49V31a13 13 0 0 1 26 0v18Z" fill="${DOOR}"/>
  <rect x="29.25" y="26" width="5.5" height="23" rx="1" fill="${BRASS}"/>
  <rect x="14" y="49" width="36" height="3.5" rx="1.75" fill="${DOOR}" opacity="0.9"/>`;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${INK}"/>${artwork}</svg>`;

/** Full bleed square, artwork scaled into the safe zone (maskable icons may be cropped to a circle). */
const fullBleed = (scale: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${INK}"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${artwork}</g></svg>`;

async function png(svg: string, size: number, file: string) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
}

async function main() {
  writeFileSync(path.join(out, "icon.svg"), iconSvg);
  await png(iconSvg, 192, path.join(out, "icons", "icon-192.png"));
  await png(iconSvg, 512, path.join(out, "icons", "icon-512.png"));
  await png(fullBleed(0.78), 512, path.join(out, "icons", "maskable-512.png"));
  await png(fullBleed(0.9), 180, path.join(out, "apple-touch-icon.png"));
  console.log("Icons written to public/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
