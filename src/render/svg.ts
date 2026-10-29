import type { GradientStop } from "./color";
import { icon as iconSvg, type IconName } from "./icons";

const KEY_SIZE = 144;
const BACKGROUND = "#1b1b1f";
const ACCENT = "#3b82f6";
const MUTED = "#8a8a93";
const FONT = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;

export type KeyOptions = {
	icon?: IconName;
	iconColor?: string;
	/** Main text, wrapped onto up to two lines. */
	label?: string;
	/** Smaller secondary text below the label. */
	sub?: string;
	/** Gradient band shown above the label, e.g. a palette preview. */
	gradient?: GradientStop[];
	/** Large color swatch shown instead of an icon. */
	swatch?: string;
	/** Draws an accent border, e.g. when the key's effect is the active one. */
	active?: boolean;
	/** Dims the key and shows "Offline". */
	offline?: boolean;
};

/** Renders a key image as a data URL. */
export function renderKey(options: KeyOptions): string {
	const { offline } = options;
	const lines = options.label ? wrap(options.label, 11, 2) : [];
	const sub = offline ? "Offline" : options.sub;
	const parts: string[] = [`<rect width="${KEY_SIZE}" height="${KEY_SIZE}" fill="${BACKGROUND}"/>`];

	// Vertical layout: graphic on top, followed by the optional gradient band, label lines, and sub-label.
	const textHeight = lines.length * 22 + (sub ? 20 : 0) + (options.gradient ? 22 : 0);
	const graphicSize = Math.min(64, KEY_SIZE - 28 - textHeight);
	const top = (KEY_SIZE - (graphicSize + textHeight + (textHeight ? 8 : 0))) / 2;
	let y = top + graphicSize + 8;

	if (options.swatch) {
		const r = graphicSize / 2;
		parts.push(`<circle cx="72" cy="${top + r}" r="${r}" fill="${options.swatch}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>`);
	} else if (options.icon) {
		const scale = graphicSize / 24;
		parts.push(`<g transform="translate(${72 - graphicSize / 2} ${top}) scale(${scale})">${iconSvg(options.icon, options.iconColor ?? "#ffffff")}</g>`);
	}

	if (options.gradient) {
		parts.push(gradientDefs("band", options.gradient));
		parts.push(`<rect x="16" y="${y}" width="112" height="14" rx="4" fill="url(#band)"/>`);
		y += 22;
	}

	for (const line of lines) {
		y += 18;
		parts.push(`<text x="72" y="${y}" text-anchor="middle" font-size="19" font-weight="bold" fill="#ffffff" ${FONT}>${escape(line)}</text>`);
		y += 4;
	}

	if (sub) {
		y += 16;
		const color = offline ? "#f87171" : MUTED;
		parts.push(`<text x="72" y="${y}" text-anchor="middle" font-size="15" fill="${color}" ${FONT}>${escape(truncate(sub, 16))}</text>`);
	}

	if (options.active) {
		parts.push(`<rect x="3" y="3" width="138" height="138" rx="14" fill="none" stroke="${ACCENT}" stroke-width="6"/>`);
	}

	const body = offline ? `<g opacity="0.45">${parts.join("")}</g>` : parts.join("");
	return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">${body}</svg>`);
}

/** Renders an icon for a dial's touch strip layout. */
export function renderDialIcon(name: IconName, color = "#ffffff"): string {
	return toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">${iconSvg(name, color)}</svg>`);
}

/** Renders a horizontal gradient strip for a dial's touch strip layout. */
export function renderStrip(stops: GradientStop[], width = 168, height = 14): string {
	return toDataUrl(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${gradientDefs("strip", stops)}<rect width="${width}" height="${height}" rx="4" fill="url(#strip)"/></svg>`,
	);
}

/** A transparent image, used to clear a pixmap. */
export const EMPTY_IMAGE = toDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`);

function gradientDefs(id: string, stops: GradientStop[]): string {
	const list = stops.length === 1 ? [stops[0], { ...stops[0], offset: 1 }] : stops;
	const stopTags = list.map((s) => `<stop offset="${+s.offset.toFixed(3)}" stop-color="${s.color}"/>`).join("");
	return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stopTags}</linearGradient></defs>`;
}

function toDataUrl(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Word-wraps text into at most `maxLines` lines of roughly `width` characters, truncating the last line. */
export function wrap(text: string, width: number, maxLines: number): string[] {
	const lines: string[] = [];
	let current = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (!current) {
			current = word;
		} else if (current.length + 1 + word.length <= width) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) {
		lines.push(current);
	}
	if (lines.length > maxLines) {
		lines.length = maxLines;
		lines[maxLines - 1] += "…";
	}
	return lines.map((line) => truncate(line, width + 1));
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escape(text: string): string {
	return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}
