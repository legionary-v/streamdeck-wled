/**
 * Subset of the WLED JSON API used by this plugin.
 * @see https://kno.wled.ge/interfaces/json-api/
 */

/** RGB or RGBW color as sent/received by WLED. */
export type WledColor = number[];

export type WledSegment = {
	id: number;
	n?: string;
	start: number;
	stop: number;
	on: boolean;
	bri: number;
	col: WledColor[];
	fx: number;
	sx: number;
	ix: number;
	pal: number;
	c1?: number;
	c2?: number;
	c3?: number;
	sel?: boolean;
};

export type WledState = {
	on: boolean;
	bri: number;
	transition?: number;
	ps: number;
	pl: number;
	mainseg?: number;
	seg: WledSegment[];
};

export type WledInfo = {
	ver: string;
	name: string;
	mac?: string;
	ip?: string;
	fxcount: number;
	palcount: number;
	cpalcount?: number;
	leds: { count: number; rgbw?: boolean; cct?: number };
};

/** Segment fields that can be written. */
export type SegmentPatch = Partial<Omit<WledSegment, "id" | "start" | "stop">> & { id?: number };

/** A (partial) state update. `seg` as an object applies to all selected segments when `id` is omitted. */
export type StatePatch = Partial<Omit<WledState, "on" | "seg">> & {
	/** `"t"` toggles the current power state. */
	on?: boolean | "t";
	seg?: SegmentPatch;
	v?: boolean;
	[key: string]: unknown;
};

/** A palette color stop: `[position 0-255, r, g, b]`. */
export type PaletteStop = [number, number, number, number];

/** Named item (effect, palette, preset) with its WLED id. */
export type NamedItem = { id: number; name: string };
