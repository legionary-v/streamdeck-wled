import { action, type KeyDownEvent } from "@elgato/streamdeck";

import type { KeyOptions } from "../render/svg";
import type { DeviceSettings } from "../wled/manager";
import { WledAction } from "./wled-action";

type CustomJsonSettings = DeviceSettings & {
	/** Any WLED JSON API state payload, e.g. `{"on":true,"seg":[{"fx":9}]}`. */
	json?: string;
};

/**
 * Sends an arbitrary JSON API command, for anything the other actions don't cover.
 * @see https://kno.wled.ge/interfaces/json-api/
 */
@action({ UUID: "com.legionary-v.wled.custom-json" })
export class CustomJson extends WledAction<CustomJsonSettings> {
	override async onKeyDown(ev: KeyDownEvent<CustomJsonSettings>): Promise<void> {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (!client) return;

		let payload: unknown;
		try {
			payload = JSON.parse(settings.json ?? "");
		} catch {
			await ev.action.showAlert();
			return;
		}
		client.sendRaw(payload);
	}

	protected override renderKey(): KeyOptions {
		return { icon: "json", label: "JSON" };
	}
}
