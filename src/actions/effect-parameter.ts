import { action, type DialDownEvent, type DialRotateEvent, type FeedbackPayload, type KeyDownEvent, type TouchTapEvent } from "@elgato/streamdeck";

import { type KeyOptions, renderDialIcon } from "../render/svg";
import type { WledClient } from "../wled/client";
import type { DeviceSettings } from "../wled/manager";
import { type Instance, segmentId, segmentOf, segmentPatch, WledAction } from "./wled-action";
import { clamp, num } from "./util";

type Parameter = "sx" | "ix" | "c1" | "c2" | "c3";

type EffectParameterSettings = DeviceSettings & {
	param?: Parameter;
	/** Key behavior. */
	mode?: "set" | "up" | "down";
	/** Value for `set`, in percent. */
	value?: number | string;
	/** Step for `up`/`down` and per dial tick, in percent. */
	step?: number | string;
};

const LABELS: Record<Parameter, string> = { sx: "Speed", ix: "Intensity", c1: "Custom 1", c2: "Custom 2", c3: "Custom 3" };

/** `c3` is a 5-bit value (0-31); the others are 0-255. */
const MAX: Record<Parameter, number> = { sx: 255, ix: 255, c1: 255, c2: 255, c3: 31 };

/**
 * Adjusts an effect parameter (speed, intensity, or a custom slider). As a dial: rotate to adjust, press or tap to reset to 50%.
 */
@action({ UUID: "com.legionary-v.wled.effect-parameter" })
export class EffectParameter extends WledAction<EffectParameterSettings> {
	override onKeyDown(ev: KeyDownEvent<EffectParameterSettings>): void {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (!client) return;

		const step = num(settings.step, 10);
		switch (settings.mode ?? "set") {
			case "set":
				set(client, settings, num(settings.value, 50));
				break;
			case "up":
				adjust(client, settings, step);
				break;
			case "down":
				adjust(client, settings, -step);
				break;
		}
	}

	override onDialRotate(ev: DialRotateEvent<EffectParameterSettings>): void {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (client) {
			adjust(client, settings, ev.payload.ticks * num(settings.step, 4));
		}
	}

	override onDialDown(ev: DialDownEvent<EffectParameterSettings>): void {
		const client = this.clientFor(ev.action, ev.payload.settings);
		if (client) set(client, ev.payload.settings, 50);
	}

	override onTouchTap(ev: TouchTapEvent<EffectParameterSettings>): void {
		const client = this.clientFor(ev.action, ev.payload.settings);
		if (client) set(client, ev.payload.settings, 50);
	}

	protected override renderKey(instance: Instance<EffectParameterSettings>): KeyOptions {
		const { settings } = instance;
		const mode = settings.mode ?? "set";
		const step = num(settings.step, 10);
		const current = currentPercent(instance);
		const name = LABELS[param(settings)];
		return {
			icon: "speed",
			label: mode === "set" ? `${name} ${num(settings.value, 50)}%` : `${name} ${mode === "up" ? "+" : "−"}${step}%`,
			sub: current === undefined ? undefined : `Now ${current}%`,
			active: mode === "set" && current === num(settings.value, 50),
		};
	}

	protected override renderDial(instance: Instance<EffectParameterSettings>): FeedbackPayload {
		const current = currentPercent(instance);
		return {
			title: LABELS[param(instance.settings)],
			icon: renderDialIcon("speed"),
			value: current === undefined ? "—" : `${current}%`,
			indicator: { value: current ?? 0 },
		};
	}
}

function param(settings: EffectParameterSettings): Parameter {
	return settings.param && settings.param in LABELS ? settings.param : "sx";
}

function currentPercent(instance: Instance<EffectParameterSettings>): number | undefined {
	const key = param(instance.settings);
	const value = segmentOf(instance)?.[key];
	return value === undefined ? undefined : Math.round((value / MAX[key]) * 100);
}

function set(client: WledClient, settings: EffectParameterSettings, percent: number): void {
	const key = param(settings);
	const value = Math.round((clamp(percent, 0, 100) / 100) * MAX[key]);
	client.send(segmentPatch(settings, { [key]: value }, {}));
}

function adjust(client: WledClient, settings: EffectParameterSettings, delta: number): void {
	const key = param(settings);
	const value = client.segment(segmentId(settings))?.[key];
	if (value !== undefined) {
		set(client, settings, (value / MAX[key]) * 100 + delta);
	}
}
