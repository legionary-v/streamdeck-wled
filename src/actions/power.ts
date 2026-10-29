import { action, type KeyDownEvent } from "@elgato/streamdeck";

import { visibleColor } from "../render/color";
import type { KeyOptions } from "../render/svg";
import type { DeviceSettings } from "../wled/manager";
import { type Instance, segmentOf, WledAction } from "./wled-action";

type PowerSettings = DeviceSettings & {
	mode?: "toggle" | "on" | "off";
};

/**
 * Turns the device on or off. The key shows the current power state in the device's primary color.
 */
@action({ UUID: "com.legionary-v.wled.power" })
export class Power extends WledAction<PowerSettings> {
	override onKeyDown(ev: KeyDownEvent<PowerSettings>): void {
		const client = this.clientFor(ev.action, ev.payload.settings);
		if (!client) return;

		const mode = ev.payload.settings.mode ?? "toggle";
		if (mode === "toggle") {
			client.send({ on: client.state ? !client.state.on : "t" });
		} else {
			client.send({ on: mode === "on" });
		}
	}

	protected override renderKey(instance: Instance<PowerSettings>): KeyOptions {
		const on = instance.client?.state?.on ?? false;
		const mode = instance.settings.mode ?? "toggle";
		const label = mode === "toggle" ? (on ? "On" : "Off") : mode === "on" ? "Turn on" : "Turn off";
		return {
			icon: "power",
			iconColor: on ? visibleColor(segmentOf(instance)?.col[0]) : "#5a5a63",
			label,
			sub: instance.client?.info?.name,
			active: mode !== "toggle" && on === (mode === "on"),
		};
	}
}
