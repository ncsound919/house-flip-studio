import sharp from "sharp";
import { mkdirSync } from "fs";
import { dirname } from "path";

// Simple house glyph drawn as SVG, rendered at all PWA sizes.
const svg = (size, bg) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${bg}"/>
  <path d="M128 276 L256 164 L384 276" fill="none" stroke="#ffffff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M168 260 L168 376 L344 376 L344 260" fill="none" stroke="#ffffff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M216 376 L216 300 L296 300 L296 376" fill="#ffffff"/>
</svg>`;

const outDir = "public/icons";
mkdirSync(outDir, { recursive: true });

const jobs = [
  { size: 192, bg: "#1d4ed8", name: "icon-192.png", purpose: null },
  { size: 512, bg: "#1d4ed8", name: "icon-512.png", purpose: null },
  // maskable: full-bleed square (safe zone is central 80%)
  { size: 512, bg: "#1d4ed8", name: "maskable-512.png", purpose: "maskable" },
  // apple touch icon (no transparency)
  { size: 180, bg: "#1d4ed8", name: "apple-touch-icon.png", purpose: null },
];

for (const job of jobs) {
  const input = Buffer.from(svg(job.size, job.bg));
  await sharp(input).png().toFile(`${outDir}/${job.name}`);
  console.log(`wrote ${outDir}/${job.name}`);
}
console.log("done");
