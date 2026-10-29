/**
 * Builds the default profiles bundled with the plugin (`*.sdPlugin/profiles/*.streamDeckProfile`), which Stream Deck
 * installs alongside the plugin. Run with `npm run profiles` after changing the layouts below.
 *
 * A `.streamDeckProfile` is a zip in Stream Deck's V3 profile format:
 *
 *   package.json                                   app/format metadata
 *   Profiles/<PROFILE>.sdProfile/manifest.json     device model, name, and page list
 *   Profiles/<PROFILE>.sdProfile/Profiles/<PAGE>/manifest.json   actions per controller, keyed "column,row"
 *
 * Ids are derived from names so that rebuilding produces identical files.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";

const pluginDir = path.resolve(import.meta.dirname, "../com.legionary-v.wled.sdPlugin");
const manifest = JSON.parse(readFileSync(path.join(pluginDir, "manifest.json"), "utf8"));
const PLUGIN = { Name: manifest.Name, UUID: manifest.UUID, Version: manifest.Version };

// Effect and palette ids are stable across WLED releases.
const FX = { solid: 0, rainbow: 9, aurora: 38, fire: 66, colortwinkles: 74, candle: 88, pacifica: 101 };

const key = {
	power: () => action("power", "Power", { mode: "toggle" }),
	brightness: (mode, extra = {}) => action("brightness", "Brightness", { mode, step: 10, ...extra }),
	color: (title, color) => action("color", "Color", { color }, title),
	effect: (effect) => action("effect", "Effect", { mode: "set", effect: String(effect) }),
	effectStep: (mode) => action("effect", "Effect", { mode }),
	paletteStep: (mode) => action("palette", "Palette", { mode }),
};

const dial = {
	brightness: () => action("brightness", "Brightness", { step: 5 }),
	color: (dialMode = "hue") => action("color", "Color", { dialMode, step: 5 }),
	effect: () => action("effect", "Effect", {}),
	palette: () => action("palette", "Palette", {}),
	parameter: (param) => action("effect-parameter", "Effect Speed / Intensity", { param, step: 4 }),
	preset: () => action("preset", "Preset", {}),
};

const profiles = [
	{
		file: "WLED",
		name: "WLED",
		model: "20GBA9901", // Stream Deck MK.2 (5x3); applies to all 15-key models.
		pages: [
			{
				name: "WLED",
				keypad: [
					[key.power(), key.brightness("down"), key.brightness("up"), key.effectStep("previous"), key.effectStep("next")],
					[key.color("Red", "#ff0000"), key.color("Green", "#00ff00"), key.color("Blue", "#0000ff"), key.color("Warm", "#ffb46b"), key.color("Purple", "#8000ff")],
					[key.effect(FX.rainbow), key.effect(FX.fire), key.effect(FX.aurora), key.paletteStep("previous"), key.paletteStep("next")],
				],
			},
		],
	},
	{
		file: "WLED Plus",
		name: "WLED",
		model: "20GBD9901", // Stream Deck + (4x2 keys, 4 dials)
		pages: [
			{
				name: "WLED",
				keypad: [
					[key.power(), key.effect(FX.rainbow), key.effect(FX.fire), key.effectStep("random")],
					[key.color("Red", "#ff0000"), key.color("Green", "#00ff00"), key.color("Blue", "#0000ff"), key.color("Warm", "#ffb46b")],
				],
				encoders: [dial.brightness(), dial.color(), dial.effect(), dial.palette()],
			},
			{
				name: "WLED Effects",
				keypad: [
					[key.power(), key.effectStep("previous"), key.effectStep("next"), key.paletteStep("random")],
					[key.effect(FX.aurora), key.effect(FX.colortwinkles), key.effect(FX.pacifica), key.effect(FX.candle)],
				],
				encoders: [dial.parameter("sx"), dial.parameter("ix"), dial.color("saturation"), dial.preset()],
			},
		],
	},
];

function action(id, name, settings, title) {
	return {
		Name: name,
		Plugin: PLUGIN,
		Resources: null,
		Settings: settings,
		State: 0,
		States: [
			title
				? {
						FontSize: 12,
						OutlineThickness: 2,
						ShowTitle: true,
						Title: title,
						TitleAlignment: "bottom",
						TitleColor: "#ffffff",
					}
				: {},
		],
		UUID: `${manifest.UUID}.${id}`,
		LinkedTitle: !title,
	};
}

/** Deterministic UUID (version 5 layout) from a name. */
function uuid(name) {
	const hex = createHash("sha1").update(`${manifest.UUID}/${name}`).digest("hex");
	const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function controllers(page, pageId) {
	const keypad = {};
	page.keypad.forEach((row, y) =>
		row.forEach((entry, x) => {
			keypad[`${x},${y}`] = { ActionID: uuid(`${pageId}/key/${x},${y}`), ...entry };
		}),
	);
	const result = [{ Actions: keypad, Type: "Keypad" }];
	if (page.encoders) {
		const encoder = {};
		page.encoders.forEach((entry, x) => {
			encoder[`${x},0`] = { ActionID: uuid(`${pageId}/dial/${x}`), ...entry };
		});
		result.push({ Actions: encoder, Type: "Encoder" });
	}
	return result;
}

const json = (value) => strToU8(JSON.stringify(value, null, 1));
const mtime = new Date("2026-01-01T00:00:00Z");

mkdirSync(path.join(pluginDir, "profiles"), { recursive: true });

for (const profile of profiles) {
	const profileId = uuid(`profile/${profile.file}`).toUpperCase();
	const root = `Profiles/${profileId}.sdProfile`;
	const pageIds = profile.pages.map((page) => uuid(`profile/${profile.file}/page/${page.name}`));
	const defaultPageId = uuid(`profile/${profile.file}/default`);
	const hasEncoders = profile.pages.some((page) => page.encoders);

	const files = {
		"package.json": json({
			AppVersion: "7.1.0.0",
			DeviceModel: profile.model,
			DeviceSettings: null,
			FormatVersion: 1,
			OSType: "macOS",
			OSVersion: "15.0.0",
			RequiredPlugins: [manifest.UUID],
		}),
		[`${root}/manifest.json`]: json({
			Device: { Model: profile.model, UUID: "" },
			Name: profile.name,
			Pages: { Current: pageIds[0], Default: defaultPageId, Pages: pageIds },
			Version: "3.0",
		}),
		// Stream Deck keeps an empty "default" page alongside the visible pages.
		[`${root}/Profiles/${defaultPageId.toUpperCase()}/manifest.json`]: json({
			Controllers: [{ Actions: null, Type: "Keypad" }, ...(hasEncoders ? [{ Actions: null, Type: "Encoder" }] : [])],
			Icon: "",
			Name: "",
		}),
	};

	profile.pages.forEach((page, i) => {
		files[`${root}/Profiles/${pageIds[i].toUpperCase()}/manifest.json`] = json({
			Controllers: controllers(page, pageIds[i]),
			Icon: "",
			Name: page.name,
		});
	});

	const zip = zipSync(
		Object.fromEntries(Object.entries(files).map(([name, data]) => [name, [data, { mtime }]])),
		{ level: 9 },
	);
	const out = path.join(pluginDir, "profiles", `${profile.file}.streamDeckProfile`);
	writeFileSync(out, zip);
	console.log(`Wrote ${path.relative(process.cwd(), out)} (${profile.pages.length} page${profile.pages.length > 1 ? "s" : ""})`);
}
