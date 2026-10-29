import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";

import { WledClient } from "./client";
import { Discovery } from "./discovery";

/** Settings shared by every action that targets a device. */
export type DeviceSettings = {
	/** Device chosen from the dropdown; empty means the default device. */
	host?: string;
	/** Manually entered host, taking precedence over {@link host}. */
	customHost?: string;
	/** Segment id as a string; empty means all selected segments. */
	segment?: string;
};

export type GlobalSettings = {
	/** Device used by actions that don't specify one. */
	defaultHost?: string;
};

/**
 * Owns the connection to each WLED device, and resolves which device an action targets.
 */
class WledManager extends EventEmitter<{ hostsChanged: [] }> {
	readonly discovery = new Discovery();

	#clients = new Map<string, WledClient>();
	#defaultHost = "";

	get defaultHost(): string {
		return this.#defaultHost;
	}

	async init(): Promise<void> {
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => this.#setDefaultHost(ev.settings.defaultHost));
		this.discovery.on("change", () => {
			// Discovered devices only matter for actions falling back to the first discovered device.
			if (!this.#defaultHost) {
				this.emit("hostsChanged");
			}
		});
		this.discovery.start();

		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
		this.#setDefaultHost(settings.defaultHost);
	}

	/** Resolves the host an action should talk to: its own setting, the default device, or the first discovered device. */
	resolveHost(settings: DeviceSettings): string | undefined {
		return normalizeHost(settings.customHost) || normalizeHost(settings.host) || this.#defaultHost || this.discovery.first()?.host;
	}

	client(host: string): WledClient {
		let client = this.#clients.get(host);
		if (!client) {
			client = new WledClient(host);
			this.#clients.set(host, client);
		}
		return client;
	}

	#setDefaultHost(host: string | undefined): void {
		const normalized = normalizeHost(host);
		if (normalized !== this.#defaultHost) {
			this.#defaultHost = normalized;
			this.emit("hostsChanged");
		}
	}
}

/** Accepts input such as `http://192.168.1.50/` and returns `192.168.1.50`. */
export function normalizeHost(host: string | undefined): string {
	return (host ?? "")
		.trim()
		.replace(/^[a-z]+:\/\//i, "")
		.replace(/\/.*$/, "");
}

export const wled = new WledManager();
