import { action, type DialDownEvent, type DialRotateEvent, type FeedbackPayload, type KeyDownEvent, type TouchTapEvent } from "@elgato/streamdeck";

import { visibleColor } from "../render/color";
import { type KeyOptions, renderDialIcon } from "../render/svg";
import type { WledClient } from "../wled/client";
import type { DeviceSettings } from "../wled/manager";
import type { StatePatch } from "../wled/types";
import { type Instance, segmentId, segmentOf, WledAction } from "./wled-action";
import { clamp, num } from "./util";

type BrightnessSettings = DeviceSettings & {
	/** Key behavior. */
	mode?: "set" | "up" | "down";
	/** Brightness for `set`, in percent. */
	value?: number | string;
	/** Step for `up`/`down` and per dial tick, in percent. */
	step?: number | string;
};

/**
 * Sets or steps the brightness. As a dial: rotate to adjust, press or tap to toggle power.
 *
 * Targets the master brightness, or the segment brightness when a segment is chosen.
 */
@action({ UUID: "com.legionary-v.wled.brightness" })
export class Brightness extends WledAction<BrightnessSettings> {
	override onKeyDown(ev: KeyDownEvent<BrightnessSettings>): void {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (!client) return;

		const step = num(settings.step, 10);
		switch (settings.mode ?? "set") {
			case "set":
				client.send(brightnessPatch(settings, num(settings.value, 50)));
				break;
			case "up":
				adjust(client, settings, step);
				break;
			case "down":
				adjust(client, settings, -step);
				break;
		}
	}

	override onDialRotate(ev: DialRotateEvent<BrightnessSettings>): void {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (client) {
			adjust(client, settings, ev.payload.ticks * num(settings.step, 5));
		}
	}

	override onDialDown(ev: DialDownEvent<BrightnessSettings>): void {
		this.#toggle(ev.action, ev.payload.settings);
	}

	override onTouchTap(ev: TouchTapEvent<BrightnessSettings>): void {
		this.#toggle(ev.action, ev.payload.settings);
	}

	protected override renderKey(instance: Instance<BrightnessSettings>): KeyOptions {
		const { settings } = instance;
		const mode = settings.mode ?? "set";
		const step = num(settings.step, 10);
		const label = mode === "set" ? `${num(settings.value, 50)}%` : `${mode === "up" ? "+" : "−"}${step}%`;
		const current = currentPercent(instance.client, settings);
		return {
			icon: "brightness",
			iconColor: current === undefined || current === 0 ? "#5a5a63" : "#ffd36b",
			label,
			sub: current === undefined ? undefined : current === 0 ? "Off" : `Now ${current}%`,
			active: mode === "set" && current === num(settings.value, 50),
		};
	}

	protected override renderDial(instance: Instance<BrightnessSettings>): FeedbackPayload {
		const current = currentPercent(instance.client, instance.settings);
		const on = current !== undefined && current > 0;
		return {
			title: "Brightness",
			icon: renderDialIcon("brightness", on ? "#ffd36b" : "#5a5a63"),
			value: current === undefined ? "—" : on ? `${current}%` : "Off",
			indicator: {
				value: on ? current : 0,
				bar_fill_c: on ? visibleColor(segmentOf(instance)?.col[0]) : "#5a5a63",
			},
		};
	}

	#toggle(action: Instance<BrightnessSettings>["action"], settings: BrightnessSettings): void {
		const client = this.clientFor(action, settings);
		if (!client) return;

		const id = segmentId(settings);
		const seg = client.segment(id);
		if (id !== undefined && seg) {
			client.send({ seg: { id, on: !seg.on } });
		} else {
			client.send({ on: client.state ? !client.state.on : "t" });
		}
	}
}

/** Current brightness in percent; 0 when off, `undefined` when unknown. */
function currentPercent(client: WledClient | undefined, settings: BrightnessSettings): number | undefined {
	const state = client?.state;
	if (!state) return undefined;

	const id = segmentId(settings);
	const seg = client.segment(id);
	if (id !== undefined && seg) {
		return seg.on && state.on ? toPercent(seg.bri) : 0;
	}
	return state.on ? toPercent(state.bri) : 0;
}

function adjust(client: WledClient, settings: BrightnessSettings, delta: number): void {
	const id = segmentId(settings);
	const seg = client.segment(id);
	const bri = id !== undefined && seg ? seg.bri : client.state?.bri;
	if (bri === undefined) return;

	// When the light is off, start from zero so that turning up brings it up gradually.
	const current = currentPercent(client, settings) === 0 ? 0 : toPercent(bri);
	if (current === 0 && delta < 0) return;
	client.send(brightnessPatch(settings, clamp(current + delta, 1, 100)));
}

function brightnessPatch(settings: BrightnessSettings, percent: number): StatePatch {
	const bri = Math.round((clamp(percent, 1, 100) / 100) * 255);
	const id = segmentId(settings);
	return id === undefined ? { on: true, bri } : { on: true, seg: { id, on: true, bri } };
}

function toPercent(bri: number): number {
	return Math.round((bri / 255) * 100);
}
