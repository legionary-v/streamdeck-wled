import { action, type DialDownEvent, type DialRotateEvent, type FeedbackPayload, type KeyDownEvent, type TouchTapEvent } from "@elgato/streamdeck";

import type { KeyOptions } from "../render/svg";
import { EMPTY_IMAGE } from "../render/svg";
import type { WledClient } from "../wled/client";
import type { DeviceSettings } from "../wled/manager";
import { type DataSourceItem, type Instance, namedItems, showAlert, step, WledAction } from "./wled-action";

type PresetSettings = DeviceSettings & {
	/** Key behavior. */
	mode?: "apply" | "next" | "previous";
	/** Preset id for `apply`. */
	preset?: string;
};

/**
 * Applies a preset or playlist, or steps through them. As a dial: rotate to choose a preset, press or tap to apply it.
 */
@action({ UUID: "com.legionary-v.wled.preset" })
export class Preset extends WledAction<PresetSettings> {
	/** Preset highlighted by each dial, applied on press. */
	readonly #selected = new Map<string, number>();

	protected override deviceDataSources(): string[] {
		return ["getPresets"];
	}

	override async onKeyDown(ev: KeyDownEvent<PresetSettings>): Promise<void> {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (!client) return;

		const mode = settings.mode ?? "apply";
		if (mode === "apply") {
			const id = parseInt(settings.preset ?? "", 10);
			if (Number.isNaN(id)) {
				await ev.action.showAlert();
				return;
			}
			client.send({ ps: id });
			return;
		}

		const target = step(await client.presets.get(), client.state?.ps, mode === "next" ? 1 : -1);
		if (target) {
			client.send({ ps: target.id });
		}
	}

	override async onDialRotate(ev: DialRotateEvent<PresetSettings>): Promise<void> {
		const instance = this.instance(ev.action, ev.payload.settings);
		if (!instance.client) return;

		const current = this.#selected.get(ev.action.id) ?? instance.client.state?.ps;
		const target = step(await instance.client.presets.get(), current, ev.payload.ticks);
		if (target) {
			this.#selected.set(ev.action.id, target.id);
			this.render(instance);
		}
	}

	override onDialDown(ev: DialDownEvent<PresetSettings>): void {
		this.#applySelected(this.instance(ev.action, ev.payload.settings));
	}

	override onTouchTap(ev: TouchTapEvent<PresetSettings>): void {
		this.#applySelected(this.instance(ev.action, ev.payload.settings));
	}

	protected override async dataSource(event: string, instance: Instance<PresetSettings>): Promise<DataSourceItem[] | undefined> {
		if (event === "getPresets") {
			return instance.client ? namedItems(await instance.client.presets.get(true)) : [];
		}
		return super.dataSource(event, instance);
	}

	protected override renderKey(instance: Instance<PresetSettings>): KeyOptions {
		const { settings, client } = instance;
		const mode = settings.mode ?? "apply";
		const active = client?.state?.ps;

		if (mode === "apply") {
			const id = parseInt(settings.preset ?? "", 10);
			return {
				icon: "preset",
				iconColor: active === id ? "#ffd36b" : "#ffffff",
				label: Number.isNaN(id) ? "Choose preset" : presetName(client, id),
				active: active === id,
			};
		}

		return {
			icon: "preset",
			label: mode === "next" ? "Next preset" : "Prev preset",
			sub: active !== undefined && active > 0 ? presetName(client, active) : undefined,
		};
	}

	protected override renderDial(instance: Instance<PresetSettings>): FeedbackPayload {
		const { client } = instance;
		const active = client?.state?.ps;
		const selected = this.#selected.get(instance.action.id) ?? active;
		const items = client?.presets.peek();
		return {
			title: "Preset",
			value: items?.length === 0 ? "No presets" : selected !== undefined && selected > 0 ? presetName(client, selected) : "—",
			strip: EMPTY_IMAGE,
			sub: selected !== undefined && selected > 0 && selected === active ? "Active" : items?.length ? "Press to apply" : "",
		};
	}

	#applySelected(instance: Instance<PresetSettings>): void {
		const id = this.#selected.get(instance.action.id);
		if (instance.client && id !== undefined) {
			instance.client.send({ ps: id });
		} else {
			showAlert(instance.action);
		}
	}
}

function presetName(client: WledClient | undefined, id: number): string {
	return client?.presets.peek()?.find((item) => item.id === id)?.name ?? `Preset ${id}`;
}
