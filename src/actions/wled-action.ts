import streamDeck, {
	type Action,
	type DidReceiveSettingsEvent,
	type FeedbackPayload,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { type KeyOptions, renderKey } from "../render/svg";
import type { WledClient } from "../wled/client";
import { type DeviceSettings, wled } from "../wled/manager";
import type { NamedItem, SegmentPatch, StatePatch, WledSegment } from "../wled/types";

/** An item in an sdpi-components `datasource` response. */
export type DataSourceItem = { label: string; value: string; disabled?: boolean } | { label: string; children: DataSourceItem[] };

/** A visible instance of an action, bound to the client of the device it targets. */
export type Instance<T extends DeviceSettings> = {
	action: Action<T>;
	settings: T;
	client?: WledClient;
	detach?: () => void;
	image?: string;
	feedback?: string;
};

/**
 * Base for all WLED actions: tracks visible instances, keeps them bound to the right device, re-renders them when the
 * device state changes, and answers the property inspector's `datasource` requests.
 */
export abstract class WledAction<T extends DeviceSettings = DeviceSettings> extends SingletonAction<T> {
	readonly #instances = new Map<string, Instance<T>>();


	constructor() {
		super();
		wled.on("hostsChanged", () => {
			for (const instance of this.#instances.values()) {
				this.#bind(instance);
				void this.#pushDataSources(instance);
			}
		});
	}

	/** Key image for a key instance; the base class adds the offline state and skips unchanged images. */
	protected renderKey?(instance: Instance<T>): KeyOptions;

	/** Touch strip feedback for a dial instance. */
	protected renderDial?(instance: Instance<T>): FeedbackPayload;

	override onWillAppear(ev: WillAppearEvent<T>): void {
		this.instance(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<T>): void {
		const instance = this.#instances.get(ev.action.id);
		if (instance) {
			instance.detach?.();
			instance.client?.release();
			this.#instances.delete(ev.action.id);
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): Promise<void> {
		const previous = this.#instances.get(ev.action.id)?.client;
		const instance = this.instance(ev.action, ev.payload.settings);
		if (instance.client !== previous) {
			await this.#pushDataSources(instance);
		}
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, T>): Promise<void> {
		const event = (ev.payload as { event?: unknown } | null)?.event;
		if (typeof event !== "string") {
			return;
		}

		const instance = this.instance(ev.action, await ev.action.getSettings());
		const items = await this.#dataSourceItems(event, instance);
		if (items) {
			await streamDeck.ui.sendToPropertyInspector({ event, items });
		}
	}

	/** Gets (or creates) the instance for an action, updating its settings and device binding. */
	protected instance(action: Action<T>, settings: T): Instance<T> {
		let instance = this.#instances.get(action.id);
		if (instance) {
			instance.action = action;
			instance.settings = settings;
		} else {
			instance = { action, settings };
			this.#instances.set(action.id, instance);
		}
		this.#bind(instance);
		return instance;
	}

	/**
	 * Gets the client for an action that is being used. Shows an alert and returns `undefined` when no device is configured.
	 */
	protected clientFor(action: Action<T>, settings: T): WledClient | undefined {
		const client = this.instance(action, settings).client;
		if (!client) {
			showAlert(action);
		}
		return client;
	}

	/** Datasources in this action's property inspector that depend on the selected device. */
	protected deviceDataSources(): string[] {
		return ["getSegments"];
	}

	/** Answers a property inspector `datasource` request; subclasses extend this with their own lists. */
	protected async dataSource(event: string, instance: Instance<T>): Promise<DataSourceItem[] | undefined> {
		switch (event) {
			case "getDevices":
				return deviceItems(instance.settings);
			case "getSegments":
				return segmentItems(instance.client);
		}
		return undefined;
	}

	/** Renders an instance's key image or dial feedback from the current device state. */
	protected render(instance: Instance<T>): void {
		const { action } = instance;
		if (action.isKey() && this.renderKey) {
			const options = this.renderKey(instance);
			options.offline ||= !instance.client?.connected;
			const image = renderKey(options);
			if (image !== instance.image) {
				instance.image = image;
				action.setImage(image).catch((err) => streamDeck.logger.error("setImage failed", err));
			}
		} else if (action.isDial() && this.renderDial) {
			const feedback = this.renderDial(instance);
			const serialized = JSON.stringify(feedback);
			if (serialized !== instance.feedback) {
				instance.feedback = serialized;
				action.setFeedback(feedback).catch((err) => streamDeck.logger.error("setFeedback failed", err));
			}
		}
	}

	#bind(instance: Instance<T>): void {
		const host = wled.resolveHost(instance.settings);
		const client = host ? wled.client(host) : undefined;
		if (client !== instance.client) {
			instance.detach?.();
			instance.client?.release();
			instance.client = client;
			instance.detach = undefined;
			if (client) {
				client.retain();
				const onChange = (): void => this.render(instance);
				client.on("change", onChange);
				instance.detach = () => client.off("change", onChange);
			}
		}
		this.render(instance);
	}

	async #dataSourceItems(event: string, instance: Instance<T>): Promise<DataSourceItem[] | undefined> {
		try {
			return await this.dataSource(event, instance);
		} catch (err) {
			streamDeck.logger.warn(`Datasource ${event} failed`, err);
			return [{ label: "Device unavailable", value: "", disabled: true }];
		}
	}

	/** Refreshes device-dependent dropdowns when the property inspector for this instance is open. */
	async #pushDataSources(instance: Instance<T>): Promise<void> {
		if (streamDeck.ui.action?.id !== instance.action.id) {
			return;
		}
		for (const event of ["getDevices", ...this.deviceDataSources()]) {
			const items = await this.#dataSourceItems(event, instance);
			if (items) {
				await streamDeck.ui.sendToPropertyInspector({ event, items });
			}
		}
	}
}

/** Shows the alert indicator on keys and dials. */
export function showAlert(action: Action<DeviceSettings>): void {
	if (action.isKey() || action.isDial()) {
		action.showAlert().catch(() => {});
	}
}

/** Parses the segment setting; `undefined` targets all selected segments. */
export function segmentId(settings: DeviceSettings): number | undefined {
	const id = parseInt(settings.segment ?? "", 10);
	return Number.isNaN(id) ? undefined : id;
}

/** Gets the segment an action reads its current values from. */
export function segmentOf<T extends DeviceSettings>(instance: Instance<T>): WledSegment | undefined {
	return instance.client?.segment(segmentId(instance.settings));
}

/** Builds a state patch that applies segment fields to the action's segment(s). */
export function segmentPatch(settings: DeviceSettings, fields: SegmentPatch, extra: StatePatch = { on: true }): StatePatch {
	const id = segmentId(settings);
	return { ...extra, seg: id === undefined ? fields : { id, ...fields } };
}

/** Moves through a list by `delta` steps from the item with id `current`, wrapping around. */
export function step(items: NamedItem[], current: number | undefined, delta: number): NamedItem | undefined {
	if (items.length === 0) {
		return undefined;
	}
	const index = Math.max(
		0,
		items.findIndex((item) => item.id === current),
	);
	return items[(((index + delta) % items.length) + items.length) % items.length];
}

export function randomItem<T>(items: T[]): T | undefined {
	return items[Math.floor(Math.random() * items.length)];
}

export function namedItems(items: NamedItem[]): DataSourceItem[] {
	return items.map((item) => ({ label: item.name, value: String(item.id) }));
}

function deviceItems(settings: DeviceSettings): DataSourceItem[] {
	const fallback = wled.defaultHost || wled.discovery.first()?.host;
	const items: DataSourceItem[] = [{ label: fallback ? `Default device (${fallback})` : "Default device", value: "" }];
	const seen = new Set<string>();
	for (const device of wled.discovery.devices.values()) {
		seen.add(device.host);
		items.push({ label: `${device.name} (${device.host})`, value: device.host });
	}
	for (const host of [wled.defaultHost, settings.host]) {
		if (host && !seen.has(host)) {
			seen.add(host);
			items.push({ label: host, value: host });
		}
	}
	wled.discovery.refresh();
	return items;
}

function segmentItems(client: WledClient | undefined): DataSourceItem[] {
	const items: DataSourceItem[] = [{ label: "All selected segments", value: "" }];
	for (const seg of client?.state?.seg ?? []) {
		items.push({ label: seg.n ? `${seg.id}: ${seg.n}` : `Segment ${seg.id}`, value: String(seg.id) });
	}
	return items;
}
