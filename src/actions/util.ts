/** Reads a numeric setting, which may be stored as a string by text fields. */
export function num(value: number | string | undefined, fallback: number): number {
	const n = typeof value === "number" ? value : parseFloat(value ?? "");
	return Number.isFinite(n) ? n : fallback;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
