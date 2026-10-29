import { action, type DialDownEvent, type DialRotateEvent, type FeedbackPayload, type KeyDownEvent, type TouchTapEvent } from "@elgato/streamdeck";

import { colorsMatch, displayColor, hexToRgb, HUE_GRADIENT, hsvToRgb, rgbToHex, rgbToHsv, toLayoutGradient } from "../render/color";
import { type KeyOptions, renderDialIcon } from "../render/svg";
import type { DeviceSettings } from "../wled/manager";
import { type Instance, segmentOf, segmentPatch, WledAction } from "./wled-action";
import { clamp, num } from "./util";

type ColorSettings = DeviceSettings & {
	/** Color applied by the key, as `#rrggbb`. */
	color?: string;
	/** Color slot: 0 = primary, 1 = secondary, 2 = tertiary. */
	slot?: string;
	/** What the dial adjusts initially; pressing the dial switches between the two. */
	dialMode?: "hue" | "saturation";
	/** Degrees of hue, or percent of saturation, per dial tick. */
	step?: number | string;
};

const DEFAULT_COLOR = "#ff0000";

/**
 * Sets a segment color. As a dial: rotate to change hue (or saturation), press to switch between them, tap for white.
 */
@action({ UUID: "com.legionary-v.wled.color" })
export class Color extends WledAction<ColorSettings> {
	/** Current dial mode per action instance. */
	readonly #dialModes = new Map<string, "hue" | "saturation">();

	override onKeyDown(ev: KeyDownEvent<ColorSettings>): void {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		client?.send(segmentPatch(settings, { col: slotted(settings, hexToRgb(settings.color ?? DEFAULT_COLOR)) }));
	}

	override onDialRotate(ev: DialRotateEvent<ColorSettings>): void {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (!client) return;

		const instance = this.instance(ev.action, settings);
		const current = segmentOf(instance)?.col[slot(settings)];
		if (!current) return;

		const hsv = rgbToHsv(current);
		const step = num(settings.step, 5);
		if (this.#mode(instance) === "hue") {
			hsv.h = (((hsv.h + ev.payload.ticks * step) % 360) + 360) % 360;
			// Rotating hue on white (or black) should produce a visible color.
			if (hsv.s < 0.05) hsv.s = 1;
		} else {
			hsv.s = clamp(hsv.s + (ev.payload.ticks * step) / 100, 0, 1);
		}
		hsv.v = Math.max(hsv.v, 0.2);

		client.send(segmentPatch(settings, { col: slotted(settings, hsvToRgb(hsv)) }));
	}

	override onDialDown(ev: DialDownEvent<ColorSettings>): void {
		const instance = this.instance(ev.action, ev.payload.settings);
		this.#dialModes.set(ev.action.id, this.#mode(instance) === "hue" ? "saturation" : "hue");
		this.render(instance);
	}

	override onTouchTap(ev: TouchTapEvent<ColorSettings>): void {
		const { settings } = ev.payload;
		this.clientFor(ev.action, settings)?.send(segmentPatch(settings, { col: slotted(settings, [255, 255, 255]) }));
	}

	protected override renderKey(instance: Instance<ColorSettings>): KeyOptions {
		const color = instance.settings.color ?? DEFAULT_COLOR;
		const current = segmentOf(instance)?.col[slot(instance.settings)];
		return {
			swatch: color,
			active: instance.client?.state?.on && colorsMatch(current, hexToRgb(color)),
		};
	}

	protected override renderDial(instance: Instance<ColorSettings>): FeedbackPayload {
		const current = segmentOf(instance)?.col[slot(instance.settings)];
		const hsv = rgbToHsv(current ?? []);
		const hue = this.#mode(instance) === "hue";
		const full = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
		return {
			title: hue ? "Hue" : "Saturation",
			icon: renderDialIcon("color", current ? displayColor(current) : "#5a5a63"),
			value: !current ? "—" : hue ? `${Math.round(hsv.h)}°` : `${Math.round(hsv.s * 100)}%`,
			indicator: {
				value: hue ? (hsv.h / 360) * 100 : hsv.s * 100,
				bar_bg_c: hue ? toLayoutGradient(HUE_GRADIENT) : `0:#ffffff,1:${full}`,
			},
		};
	}

	#mode(instance: Instance<ColorSettings>): "hue" | "saturation" {
		return this.#dialModes.get(instance.action.id) ?? instance.settings.dialMode ?? "hue";
	}
}

function slot(settings: ColorSettings): number {
	return clamp(Math.trunc(num(settings.slot, 0)), 0, 2);
}

/** Builds a `col` array that only changes the configured slot; WLED leaves slots given as `[]` untouched. */
function slotted(settings: ColorSettings, rgb: number[]): number[][] {
	const col: number[][] = [[], [], []];
	col[slot(settings)] = rgb;
	return col.slice(0, slot(settings) + 1);
}
