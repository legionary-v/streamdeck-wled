import type { DialDownEvent, DialRotateEvent, FeedbackPayload, KeyDownEvent, TouchTapEvent } from "@elgato/streamdeck";

import { paletteGradient } from "../render/color";
import type { IconName } from "../render/icons";
import { EMPTY_IMAGE, type KeyOptions, renderStrip } from "../render/svg";
import type { WledClient } from "../wled/client";
import type { DeviceSettings } from "../wled/manager";
import type { NamedItem, SegmentPatch } from "../wled/types";
import { type DataSourceItem, type Instance, namedItems, randomItem, segmentId, segmentOf, segmentPatch, step, WledAction } from "./wled-action";

const SOLID_EFFECT = 0;

export type ListSettings = DeviceSettings & {
	/** Key behavior. */
	mode?: "set" | "next" | "previous" | "random";
	/** Item id applied in `set` mode; the setting is named after the list, e.g. `effect`. */
	[item: string]: string | undefined;
};

export type ListConfig = {
	/** Segment field the list item is written to. */
	field: "fx" | "pal";
	/** Name of the setting holding the item id for `set` mode. */
	setting: string;
	noun: string;
	icon: IconName;
	iconColor: string;
	/** Datasource the property inspector uses to list the items. */
	dataSource: string;
	/** Item applied when the dial is pressed. */
	resetId: number;
	/** Effect switched to when an item is applied while Solid is running, since Solid would hide it (e.g. a palette). */
	solidFallbackEffect?: number;
	items(client: WledClient): { get(): Promise<NamedItem[]>; peek(): NamedItem[] | undefined };
};

/**
 * An action that selects from one of the device's lists (effects or palettes): keys set a specific item or step through
 * the list; dials scroll through the list, press to reset, and tap for a random item.
 */
export abstract class ListAction extends WledAction<ListSettings> {
	protected abstract readonly config: ListConfig;

	protected override deviceDataSources(): string[] {
		return [...super.deviceDataSources(), this.config.dataSource];
	}

	override async onKeyDown(ev: KeyDownEvent<ListSettings>): Promise<void> {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (!client) return;

		const mode = settings.mode ?? "set";
		if (mode === "set") {
			const id = parseInt(settings[this.config.setting] ?? "", 10);
			if (Number.isNaN(id)) {
				await ev.action.showAlert();
				return;
			}
			this.#apply(client, settings, id);
			return;
		}

		await this.#move(client, settings, mode);
	}

	override async onDialRotate(ev: DialRotateEvent<ListSettings>): Promise<void> {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (client) {
			await this.#move(client, settings, ev.payload.ticks);
		}
	}

	override onDialDown(ev: DialDownEvent<ListSettings>): void {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (client) {
			this.#apply(client, settings, this.config.resetId);
		}
	}

	override async onTouchTap(ev: TouchTapEvent<ListSettings>): Promise<void> {
		const { settings } = ev.payload;
		const client = this.clientFor(ev.action, settings);
		if (client) {
			await this.#move(client, settings, "random");
		}
	}

	protected override async dataSource(event: string, instance: Instance<ListSettings>): Promise<DataSourceItem[] | undefined> {
		if (event === this.config.dataSource) {
			return instance.client ? namedItems(await this.config.items(instance.client).get()) : [];
		}
		return super.dataSource(event, instance);
	}

	protected override renderKey(instance: Instance<ListSettings>): KeyOptions {
		const { settings, client } = instance;
		const { noun } = this.config;
		const current = this.#current(instance);
		const mode = settings.mode ?? "set";

		if (mode === "set") {
			const id = parseInt(settings[this.config.setting] ?? "", 10);
			return {
				icon: this.config.icon,
				iconColor: this.config.iconColor,
				label: Number.isNaN(id) ? `Choose ${noun.toLowerCase()}` : this.#name(client, id),
				gradient: this.config.field === "pal" ? this.gradient(instance, id) : undefined,
				active:
					client?.state?.on === true &&
					current === id &&
					(this.config.solidFallbackEffect === undefined || segmentOf(instance)?.fx !== SOLID_EFFECT),
			};
		}

		const labels = { next: `Next ${noun.toLowerCase()}`, previous: `Prev ${noun.toLowerCase()}`, random: `Random ${noun.toLowerCase()}` };
		return {
			icon: this.config.icon,
			iconColor: this.config.iconColor,
			label: labels[mode],
			sub: current === undefined ? undefined : this.#name(client, current),
		};
	}

	protected override renderDial(instance: Instance<ListSettings>): FeedbackPayload {
		const { client } = instance;
		const current = this.#current(instance);
		const items = client ? this.config.items(client).peek() : undefined;
		const index = items?.findIndex((item) => item.id === current) ?? -1;
		const palette = segmentOf(instance)?.pal;
		const stops = this.gradient(instance, this.config.field === "pal" ? current : palette);
		return {
			title: this.config.noun,
			value: current === undefined ? "—" : this.#name(client, current),
			strip: stops ? renderStrip(stops) : EMPTY_IMAGE,
			sub: items && index >= 0 ? `${index + 1} / ${items.length}` : "",
		};
	}

	/** Gradient to show for a palette id; effects show the active palette. */
	protected gradient(instance: Instance<ListSettings>, paletteId: number | undefined): ReturnType<typeof paletteGradient> | undefined {
		if (paletteId === undefined || Number.isNaN(paletteId) || !instance.client) return undefined;
		const data = instance.client.paletteData.peek();
		return data ? paletteGradient(data.get(paletteId), segmentOf(instance)?.col) : undefined;
	}

	#current(instance: Instance<ListSettings>): number | undefined {
		return segmentOf(instance)?.[this.config.field];
	}

	#name(client: WledClient | undefined, id: number): string {
		const items = client ? this.config.items(client).peek() : undefined;
		return items?.find((item) => item.id === id)?.name ?? `${this.config.noun} ${id}`;
	}

	#apply(client: WledClient, settings: ListSettings, id: number): void {
		const fields: SegmentPatch = { [this.config.field]: id };
		const fallback = this.config.solidFallbackEffect;
		if (fallback !== undefined && client.segment(segmentId(settings))?.fx === SOLID_EFFECT) {
			fields.fx = fallback;
		}
		client.send(segmentPatch(settings, fields));
	}

	async #move(client: WledClient, settings: ListSettings, by: number | "next" | "previous" | "random"): Promise<void> {
		const items = await this.config.items(client).get();
		const current = client.segment(segmentId(settings))?.[this.config.field];
		const target =
			by === "random"
				? randomItem(items.filter((item) => item.id !== current))
				: step(items, current, by === "next" ? 1 : by === "previous" ? -1 : by);
		if (target) {
			this.#apply(client, settings, target.id);
		}
	}
}
