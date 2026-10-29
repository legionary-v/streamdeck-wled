import type { PaletteData } from "../wled/client";
import type { WledColor } from "../wled/types";

export type Hsv = { h: number; s: number; v: number };

/** A gradient stop with its position in the range 0..1. */
export type GradientStop = { offset: number; color: string };

export function rgbToHex([r = 0, g = 0, b = 0]: WledColor): string {
	return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace("#", "");
	const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
	const n = parseInt(full, 16) || 0;
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Converts an RGB(W) color to HSV, with `h` in degrees and `s`/`v` in 0..1. White is mixed in as RGB. */
export function rgbToHsv([r = 0, g = 0, b = 0, w = 0]: WledColor): Hsv {
	[r, g, b] = [r, g, b].map((c) => Math.min(255, c + w) / 255);
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	let h = 0;
	if (delta > 0) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
	}
	return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
	const f = (n: number): number => {
		const k = (n + h / 60) % 6;
		return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
	};
	return [f(5), f(3), f(1)];
}

/** Combines RGB and white channels into a displayable color. */
export function displayColor(color: WledColor | undefined): string {
	const [r = 0, g = 0, b = 0, w = 0] = color ?? [];
	return rgbToHex([r + w, g + w, b + w].map((c) => Math.min(255, c)));
}

/** Brightens dark colors so they remain visible on a black key. */
export function visibleColor(color: WledColor | undefined): string {
	const hsv = rgbToHsv(color ?? []);
	if (hsv.v === 0) {
		return "#ffffff";
	}
	return rgbToHex(hsvToRgb({ ...hsv, v: Math.max(hsv.v, 0.85) }));
}

export function colorsMatch(a: WledColor | undefined, b: WledColor | undefined, tolerance = 6): boolean {
	if (!a || !b) return false;
	return [0, 1, 2].every((i) => Math.abs((a[i] ?? 0) - (b[i] ?? 0)) <= tolerance);
}

/** Full rainbow, for the hue dial. */
export const HUE_GRADIENT: GradientStop[] = [0, 60, 120, 180, 240, 300, 360].map((h) => ({
	offset: h / 360,
	color: rgbToHex(hsvToRgb({ h, s: 1, v: 1 })),
}));

/**
 * Resolves WLED palette data into gradient stops. Placeholders refer to the segment colors (`c1`..`c3`),
 * or random colors (`r`), which are shown as a rainbow.
 */
export function paletteGradient(data: PaletteData | undefined, segmentColors: WledColor[] = []): GradientStop[] {
	if (!data || data.length === 0) {
		return [{ offset: 0, color: "#333333" }];
	}

	if (data.every((entry) => entry === "r")) {
		return HUE_GRADIENT;
	}

	return data.map((entry, i) => {
		if (Array.isArray(entry)) {
			const [pos, r, g, b] = entry;
			return { offset: pos / 255, color: rgbToHex([r, g, b]) };
		}
		const slot = Number(entry.replace("c", "")) - 1;
		return {
			offset: data.length === 1 ? 0 : i / (data.length - 1),
			color: slot >= 0 ? displayColor(segmentColors[slot]) : rgbToHex(hsvToRgb({ h: (i * 137) % 360, s: 1, v: 1 })),
		};
	});
}

/** Formats stops for a layout `bar_bg_c` property, e.g. `0:#ff0000,1:#0000ff`. */
export function toLayoutGradient(stops: GradientStop[]): string {
	return stops.map((s) => `${+s.offset.toFixed(3)}:${s.color}`).join(",");
}
