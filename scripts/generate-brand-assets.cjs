/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Renders every IndexForge icon from one SVG definition.
 *
 *   node scripts/generate-brand-assets.cjs
 *
 * The geometry is a copy of `src/components/brand/logo.tsx` on the same 64×64
 * grid. Two copies of a shape is normally a smell, but the alternative is worse:
 * the React component has to be a component (themeable, inlined, no network),
 * and this has to run in plain Node with no bundler. Keeping both on the same
 * grid with the same path data means a change is a mechanical copy rather than
 * a redraw. `brand-assets.test.ts` fails if the two drift.
 *
 * Previously this hand-plotted pixels through a bare zlib PNG encoder, which was
 * fine for three rectangles and hopeless for an anvil. sharp is already a
 * dependency (Next uses it for image optimisation) and rasterises SVG properly.
 */

const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const OBSIDIAN = "#0f172a";
const MOLTEN = "#ff5722";
const STEEL = "#3b82f6";
const FACE = "#f8fafc";

/** The mark, on a 64×64 grid. `plate` draws the obsidian squircle behind it. */
function markSvg({ plate = true, face = FACE, molten = MOLTEN, steel = STEEL, scale = 1 } = {}) {
  // Scaling shrinks the artwork inside the same canvas, which is how Android's
  // adaptive icon gets its safe zone — the launcher crops to a circle and any
  // shape filling the square loses its corners.
  const inset = (64 * (1 - scale)) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  ${plate ? `<rect width="64" height="64" rx="15" fill="${OBSIDIAN}"/>` : ""}
  <g transform="translate(${inset} ${inset}) scale(${scale})">
    <g fill="${steel}">
      <rect x="12" y="28" width="5.5" height="10" rx="1.5"/>
      <rect x="20" y="23" width="5.5" height="15" rx="1.5"/>
      <rect x="28" y="18" width="5.5" height="20" rx="1.5"/>
    </g>
    <path d="M4 44.5 16 40 H52 v7 H16 Z M26 47 H42 L39.5 53 H28.5 Z M21 53 H47 L50 58.5 H18 Z" fill="${face}"/>
    <path d="M14 38 27 27l7 5 13-13" stroke="${molten}" stroke-width="5"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M40 12 H54 V26 Z" fill="${molten}"/>
  </g>
</svg>`;
}

async function write(file, svg, size) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  ${path.relative(process.cwd(), file).padEnd(46)} ${size}px  ${kb} KB`);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const mobile = path.join(root, "apps", "mobile", "assets");
  const desktop = path.join(root, "apps", "desktop", "build");
  const web = path.join(root, "public");

  console.log("IndexForge assets");

  // Store icon: full bleed, plate included. iOS masks it to a squircle itself,
  // so the artwork must reach the edges.
  await write(path.join(mobile, "icon.png"), markSvg({ plate: true }), 1024);

  // Android adaptive foreground: transparent, and inset because the launcher
  // crops to whatever shape the device prefers.
  await write(
    path.join(mobile, "adaptive-icon.png"),
    markSvg({ plate: false, scale: 0.62 }),
    1024,
  );

  // Splash: no plate — the splash screen supplies its own background, obsidian
  // in dark and slate in light, so the mark must sit on either.
  await write(path.join(mobile, "splash-icon.png"), markSvg({ plate: false }), 512);

  // Android tints the notification icon a flat colour and discards everything
  // but the alpha channel, so this is a white silhouette. Drawing it in brand
  // colours would produce a white blob with no internal shape.
  await write(
    path.join(mobile, "notification-icon.png"),
    markSvg({ plate: false, face: "#ffffff", molten: "#ffffff", steel: "#ffffff" }),
    96,
  );

  await write(path.join(mobile, "favicon.png"), markSvg({ plate: true }), 48);
  await write(path.join(desktop, "icon.png"), markSvg({ plate: true }), 1024);
  await write(path.join(web, "icon.png"), markSvg({ plate: true }), 512);
  await write(path.join(web, "apple-icon.png"), markSvg({ plate: true }), 180);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

module.exports = { markSvg };
