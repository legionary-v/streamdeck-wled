/**
 * Renders the static PNG images referenced by the manifest (action list icons, default key images, plugin icons)
 * from the artwork in src/render/icons.ts. Run with `npm run icons` after changing the artwork.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { icon } from "../src/render/icons.ts";

const root = path.resolve(import.meta.dirname, "../com.legionary-v.wled.sdPlugin/imgs");

/** Action id → icon artwork and accent color used on the default key image. */
const actions = {
	power: ["power", "#ffffff"],
	brightness: ["brightness", "#ffd36b"],
	color: ["color", "#ff4d4d"],
	effect: ["effect", "#b388ff"],
	palette: ["palette", "#4dd0e1"],
	"effect-parameter": ["speed", "#ffffff"],
	preset: ["preset", "#ffd36b"],
	"custom-json": ["json", "#ffffff"],
};

async function png(svg, file, size) {
	mkdirSync(path.dirname(file), { recursive: true });
	await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(file);
}

/** Writes `name.png` and `name@2x.png`. */
async function pair(svgForSize, file, size) {
	await png(svgForSize(size), `${file}.png`, size);
	await png(svgForSize(size * 2), `${file}@2x.png`, size * 2);
}

const glyph = (name, color, size, padding = 0) => {
	const scale = (size - padding * 2) / 24;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><g transform="translate(${padding} ${padding}) scale(${scale})">${icon(name, color)}</g></svg>`;
};

const key = (name, color, size) => {
	const scale = (size * 0.5) / 24;
	const offset = size * 0.25;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#1b1b1f"/><g transform="translate(${offset} ${offset}) scale(${scale})">${icon(name, color)}</g></svg>`;
};

for (const [id, [name, color]] of Object.entries(actions)) {
	// Action list icons are monochrome; Stream Deck tints them.
	await pair((size) => glyph(name, "#ffffff", size, size * 0.05), path.join(root, "actions", id, "icon"), 20);
	await pair((size) => key(name, color, size), path.join(root, "actions", id, "key"), 72);
}

await pair((size) => glyph("wled", "#ffffff", size, size * 0.05), path.join(root, "plugin", "category-icon"), 28);

const marketplace = (size) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 288 288">
		<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3d77"/><stop offset="0.5" stop-color="#7c4dff"/><stop offset="1" stop-color="#00c2ff"/></linearGradient></defs>
		<rect width="288" height="288" rx="56" fill="url(#g)"/>
		<g transform="translate(48 48) scale(8)">${icon("wled", "#ffffff")}</g>
	</svg>`;
await pair(marketplace, path.join(root, "plugin", "marketplace"), 288);

console.log(`Icons written to ${path.relative(process.cwd(), root)}`);
