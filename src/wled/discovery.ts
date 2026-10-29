import streamDeck from "@elgato/streamdeck";
import { Bonjour, type Browser, type Service } from "bonjour-service";
import { EventEmitter } from "node:events";
import { isIPv4 } from "node:net";

export type DiscoveredDevice = {
	/** IPv4 address of the device. */
	host: string;
	/** Friendly name configured on the device, falling back to its mDNS name. */
	name: string;
};

/**
 * Discovers WLED devices on the local network using mDNS (WLED advertises `_wled._tcp`).
 */
export class Discovery extends EventEmitter<{ change: [] }> {
	readonly devices = new Map<string, DiscoveredDevice>();

	#bonjour?: Bonjour;
	#browser?: Browser;

	start(): void {
		if (this.#bonjour) {
			return;
		}
		try {
			this.#bonjour = new Bonjour(undefined, (err: unknown) => streamDeck.logger.warn("mDNS error", err));
			this.#browser = this.#bonjour.find({ type: "wled" });
			this.#browser.on("up", (service: Service) => this.#onUp(service));
			this.#browser.on("down", (service: Service) => {
				const host = addressOf(service);
				if (host && this.devices.delete(host)) {
					this.emit("change");
				}
			});
		} catch (err) {
			streamDeck.logger.warn("Unable to start WLED discovery", err);
		}
	}

	/** Sends a fresh mDNS query, e.g. when the property inspector asks for the device list. */
	refresh(): void {
		this.#browser?.update();
	}

	/** First discovered device, used when no device has been configured. */
	first(): DiscoveredDevice | undefined {
		return this.devices.values().next().value;
	}

	#onUp(service: Service): void {
		const host = addressOf(service);
		if (!host || this.devices.has(host)) {
			return;
		}

		this.devices.set(host, { host, name: service.name });
		this.emit("change");

		// The mDNS name is derived from the MAC address; prefer the name the user gave the device.
		fetch(`http://${host}/json/info`, { signal: AbortSignal.timeout(5000) })
			.then((res) => res.json() as Promise<{ name?: string }>)
			.then((info) => {
				const device = this.devices.get(host);
				if (device && info.name) {
					device.name = info.name;
					this.emit("change");
				}
			})
			.catch(() => {});
	}
}

function addressOf(service: Service): string | undefined {
	return service.addresses?.find((address) => isIPv4(address)) ?? service.referer?.address;
}
