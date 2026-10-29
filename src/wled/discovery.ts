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
 * Discovers WLED devices on the local network using mDNS.
 */
export class Discovery extends EventEmitter<{ change: [] }> {
	readonly devices = new Map<string, DiscoveredDevice>();

	#bonjour?: Bonjour;
	#browsers: Browser[] = [];
	#probing = new Set<string>();

	start(): void {
		if (this.#bonjour) {
			return;
		}
		try {
			this.#bonjour = new Bonjour(undefined, (err: unknown) => streamDeck.logger.warn("mDNS error", err));
			// Older WLED releases advertise `_wled._tcp`; newer ones only advertise `_http._tcp`, so browse both.
			for (const type of ["wled", "http"]) {
				const browser = this.#bonjour.find({ type });
				browser.on("up", (service: Service) => this.#onUp(service));
				browser.on("down", (service: Service) => {
					const host = addressOf(service);
					if (host && this.devices.delete(host)) {
						this.emit("change");
					}
				});
				this.#browsers.push(browser);
			}
		} catch (err) {
			streamDeck.logger.warn("Unable to start WLED discovery", err);
		}
	}

	/** Sends a fresh mDNS query, e.g. when the property inspector asks for the device list. */
	refresh(): void {
		this.#browsers.forEach((browser) => browser.update());
	}

	/** First discovered device, used when no device has been configured. */
	first(): DiscoveredDevice | undefined {
		return this.devices.values().next().value;
	}

	/** Adds a service once `/json/info` confirms it's a WLED device, using the name configured on the device. */
	#onUp(service: Service): void {
		const host = addressOf(service);
		if (!host || this.devices.has(host) || this.#probing.has(host)) {
			return;
		}

		this.#probing.add(host);
		fetch(`http://${host}/json/info`, { signal: AbortSignal.timeout(5000) })
			.then((res) => (res.ok ? (res.json() as Promise<{ name?: string; ver?: string; leds?: unknown }>) : undefined))
			.then((info) => {
				if (info?.ver && info.leds) {
					this.devices.set(host, { host, name: info.name || service.name });
					this.emit("change");
				}
			})
			.catch(() => {})
			.finally(() => this.#probing.delete(host));
	}
}

function addressOf(service: Service): string | undefined {
	return service.addresses?.find((address) => isIPv4(address)) ?? service.referer?.address;
}
