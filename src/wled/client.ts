import streamDeck from "@elgato/streamdeck";
import { EventEmitter } from "node:events";

import type { NamedItem, PaletteStop, SegmentPatch, StatePatch, WledInfo, WledSegment, WledState } from "./types";

/** Minimum time between messages sent to the device; rapid dial turns are coalesced into a single update. */
const SEND_INTERVAL_MS = 50;

/** Local changes are re-applied over incoming state for this long, so stale echoes don't make dials jitter. */
const ECHO_WINDOW_MS = 600;

const CONNECT_TIMEOUT_MS = 5000;
const MAX_RETRY_DELAY_MS = 30_000;
const IDLE_CLOSE_MS = 10_000;
const PRESETS_TTL_MS = 30_000;
const LIST_RETRY_MS = 10_000;

/** Raw palette data from `/json/palx`: either color stops, or placeholders such as `"c1"` (segment color 1) and `"r"` (random). */
export type PaletteData = (PaletteStop | string)[];

/**
 * Connection to a single WLED device. State is received and sent over the device's WebSocket (`ws://host/ws`);
 * HTTP is only used for lists (effects, palettes, presets) and as a fallback when the socket is unavailable.
 */
export class WledClient extends EventEmitter<{ change: [] }> {
	readonly host: string;

	state?: WledState;
	info?: WledInfo;

	#ws?: WebSocket;
	#refs = 0;
	#retryCount = 0;
	#retryTimer?: NodeJS.Timeout;
	#idleTimer?: NodeJS.Timeout;

	#pending?: StatePatch;
	#flushTimer?: NodeJS.Timeout;
	#lastSend = 0;
	#recent: { time: number; patch: StatePatch }[] = [];

	constructor(host: string) {
		super();
		this.host = host;
	}

	/** Whether the WebSocket is open and the device state is known. */
	get connected(): boolean {
		return this.#ws?.readyState === WebSocket.OPEN && this.state !== undefined;
	}

	/** Registers interest in this device, opening the WebSocket if required. */
	retain(): void {
		this.#refs++;
		clearTimeout(this.#idleTimer);
		this.#connect();
	}

	/** Releases interest in this device; the WebSocket is closed once nothing has used it for a while. */
	release(): void {
		this.#refs = Math.max(0, this.#refs - 1);
		if (this.#refs === 0) {
			clearTimeout(this.#idleTimer);
			this.#idleTimer = setTimeout(() => this.#disconnect(), IDLE_CLOSE_MS);
		}
	}

	/**
	 * Queues a state update. Updates sent in quick succession are merged and sent at most every {@link SEND_INTERVAL_MS}.
	 * The update is applied to the local state immediately so that subsequent relative changes (e.g. dial turns) build on it.
	 */
	send(patch: StatePatch): void {
		if (this.#pending && !canMergeSegments(this.#pending.seg, patch.seg)) {
			this.#flush();
		}
		this.#pending = mergePatch(this.#pending ?? {}, patch);

		if (this.state) {
			applyPatch(this.state, patch);
			this.#recent.push({ time: Date.now(), patch });
			this.emit("change");
		}

		if (!this.#flushTimer) {
			const wait = Math.max(0, this.#lastSend + SEND_INTERVAL_MS - Date.now());
			this.#flushTimer = setTimeout(() => this.#flush(), wait);
		}
	}

	/** Sends an arbitrary JSON API payload as-is, without merging or local state prediction. */
	sendRaw(payload: unknown): void {
		this.#flush();
		this.#transmit(payload);
	}

	/** Gets the segment an action should read from: the given id, otherwise the first selected or main segment. */
	segment(id?: number): WledSegment | undefined {
		const segments = this.state?.seg ?? [];
		if (id !== undefined) {
			return segments.find((s) => s.id === id);
		}
		return segments.find((s) => s.sel) ?? segments.find((s) => s.id === this.state?.mainseg) ?? segments[0];
	}

	/** Effects, with "Solid" first followed by the rest alphabetically (matching the WLED UI). */
	readonly effects = this.#lazy(async () => {
		const names = await this.#fetchJson<string[]>("/json/effects");
		return sortNamed(toNamed(names), (item) => item.id === 0);
	});

	/** Palettes, with "Default" and the color-based (`*`) palettes first, followed by the rest alphabetically. */
	readonly palettes = this.#lazy(async () => {
		const items = toNamed(await this.#fetchJson<string[]>("/json/palettes"));
		for (let i = 0; i < (this.info?.cpalcount ?? 0); i++) {
			items.push({ id: 255 - i, name: `Custom ${i + 1}` });
		}
		return sortNamed(items, (item) => item.id === 0 || item.name.startsWith("*"));
	});

	/** Color data for every palette, loaded page by page from `/json/palx`. */
	readonly paletteData = this.#lazy(async () => {
		const map = new Map<number, PaletteData>();
		let page = 0;
		let maxPage = 0;
		do {
			const res = await this.#fetchJson<{ m: number; p: Record<string, PaletteData> }>(`/json/palx?page=${page}`);
			maxPage = res.m;
			for (const [id, data] of Object.entries(res.p)) {
				map.set(Number(id), data);
			}
		} while (++page <= maxPage);
		return map;
	});

	/** Presets and playlists saved on the device, ordered by id. */
	readonly presets = this.#lazy(async () => {
		const presets = await this.#fetchJson<Record<string, { n?: string }>>("/presets.json");
		return Object.entries(presets)
			.filter(([id, preset]) => Number(id) > 0 && Object.keys(preset).length > 0)
			.map(([id, preset]) => ({ id: Number(id), name: preset.n || `Preset ${id}` }))
			.sort((a, b) => a.id - b.id);
	}, PRESETS_TTL_MS);

	#lazy<T>(load: () => Promise<T>, ttl?: number): Lazy<T> {
		return new Lazy(load, () => this.emit("change"), () => this.connected, ttl);
	}

	#connect(): void {
		if (this.#ws || this.#refs === 0) {
			return;
		}

		clearTimeout(this.#retryTimer);
		const ws = new WebSocket(`ws://${this.host}/ws`);
		this.#ws = ws;

		const timeout = setTimeout(() => ws.close(), CONNECT_TIMEOUT_MS);
		ws.onopen = () => {
			clearTimeout(timeout);
			this.#retryCount = 0;
			streamDeck.logger.info(`Connected to WLED at ${this.host}`);
		};
		ws.onmessage = (msg) => this.#onMessage(msg.data);
		ws.onerror = () => {
			// A close event always follows, which handles reconnecting.
		};
		ws.onclose = () => {
			clearTimeout(timeout);
			if (this.#ws !== ws) {
				return;
			}
			this.#ws = undefined;
			this.emit("change");

			if (this.#refs > 0) {
				const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** this.#retryCount++);
				streamDeck.logger.warn(`WLED at ${this.host} disconnected; retrying in ${delay}ms`);
				this.#retryTimer = setTimeout(() => this.#connect(), delay);
			}
		};
	}

	#disconnect(): void {
		clearTimeout(this.#retryTimer);
		const ws = this.#ws;
		this.#ws = undefined;
		ws?.close();
	}

	#onMessage(data: unknown): void {
		if (typeof data !== "string") {
			return;
		}
		try {
			const msg = JSON.parse(data) as { state?: WledState; info?: WledInfo };
			if (msg.info) {
				this.info = msg.info;
			}
			if (msg.state) {
				this.#applyRemoteState(msg.state);
			}
		} catch (err) {
			streamDeck.logger.warn(`Invalid message from WLED at ${this.host}`, err);
		}
	}

	#applyRemoteState(state: WledState): void {
		const cutoff = Date.now() - ECHO_WINDOW_MS;
		this.#recent = this.#recent.filter((r) => r.time >= cutoff);
		for (const { patch } of this.#recent) {
			applyPatch(state, patch);
		}
		this.state = state;
		this.emit("change");
	}

	#flush(): void {
		clearTimeout(this.#flushTimer);
		this.#flushTimer = undefined;

		const patch = this.#pending;
		this.#pending = undefined;
		if (patch) {
			this.#transmit(patch);
		}
	}

	#transmit(payload: unknown): void {
		this.#lastSend = Date.now();
		if (this.#ws?.readyState === WebSocket.OPEN) {
			this.#ws.send(JSON.stringify(payload));
		} else {
			void this.#post(payload);
		}
	}

	/** Fallback for when the WebSocket isn't open; `v: true` makes WLED respond with the full state. */
	async #post(payload: unknown): Promise<void> {
		try {
			const body = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload, v: true } : payload;
			const res = await fetch(`http://${this.host}/json/state`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
			});
			const state = (await res.json()) as WledState;
			if (state && typeof state.on === "boolean") {
				this.#applyRemoteState(state);
			}
		} catch (err) {
			streamDeck.logger.warn(`Failed to send state to WLED at ${this.host}`, err);
		}
	}

	async #fetchJson<T>(path: string): Promise<T> {
		const res = await fetch(`http://${this.host}${path}`, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
		if (!res.ok) {
			throw new Error(`GET ${path} failed: ${res.status}`);
		}
		return (await res.json()) as T;
	}
}

/**
 * Value loaded on demand over HTTP and cached. {@link peek} returns the cached value synchronously (for rendering),
 * loading it in the background when the device is reachable; `onLoad` is called once a value arrives.
 */
class Lazy<T> {
	value?: T;
	#promise?: Promise<T>;
	#time = 0;
	#failedAt = 0;

	constructor(
		private readonly load: () => Promise<T>,
		private readonly onLoad: () => void,
		private readonly canLoad: () => boolean,
		private readonly ttl = Infinity,
	) {}

	/** Gets the value, loading it when it has not been loaded, is stale, or `refresh` is set. */
	get(refresh = false): Promise<T> {
		if (!this.#promise || refresh || Date.now() - this.#time > this.ttl) {
			this.#time = Date.now();
			const promise = this.load();
			this.#promise = promise;
			promise.then(
				(value) => {
					this.value = value;
					this.onLoad();
				},
				(err) => {
					streamDeck.logger.warn("Failed to load data from WLED", err);
					this.#failedAt = Date.now();
					if (this.#promise === promise) this.#promise = undefined;
				},
			);
		}
		return this.#promise;
	}

	peek(): T | undefined {
		const stale = !this.#promise || Date.now() - this.#time > this.ttl;
		if (stale && this.canLoad() && Date.now() - this.#failedAt > LIST_RETRY_MS) {
			this.get().catch(() => {});
		}
		return this.value;
	}
}

function toNamed(names: string[]): NamedItem[] {
	return names.map((name, id) => ({ id, name })).filter((item) => item.name && item.name !== "RSVD" && item.name !== "-");
}

/** Sorts items alphabetically, keeping items matching `pinned` at the start in their original order. */
function sortNamed(items: NamedItem[], pinned: (item: NamedItem) => boolean): NamedItem[] {
	const head = items.filter(pinned);
	const tail = items.filter((item) => !pinned(item)).sort((a, b) => a.name.localeCompare(b.name));
	return [...head, ...tail];
}

function canMergeSegments(a?: SegmentPatch, b?: SegmentPatch): boolean {
	return !a || !b || a.id === b.id;
}

function mergePatch(target: StatePatch, patch: StatePatch): StatePatch {
	const merged: StatePatch = { ...target, ...patch };
	if (target.seg && patch.seg) {
		merged.seg = { ...target.seg, ...patch.seg };
		if (target.seg.col && patch.seg.col) {
			const length = Math.max(target.seg.col.length, patch.seg.col.length);
			merged.seg.col = Array.from({ length }, (_, i) => (patch.seg?.col?.[i]?.length ? patch.seg.col[i] : (target.seg?.col?.[i] ?? [])));
		}
	}
	return merged;
}

/** Applies a patch to a state object in place, mirroring how WLED would apply it. */
function applyPatch(state: WledState, patch: StatePatch): void {
	if (typeof patch.on === "boolean") state.on = patch.on;
	if (typeof patch.bri === "number") state.bri = patch.bri;
	if (typeof patch.ps === "number") state.ps = patch.ps;

	const seg = patch.seg;
	if (!seg) {
		return;
	}

	let targets = seg.id === undefined ? state.seg.filter((s) => s.sel) : state.seg.filter((s) => s.id === seg.id);
	if (targets.length === 0 && seg.id === undefined) {
		targets = state.seg.filter((s) => s.id === (state.mainseg ?? 0));
	}

	for (const target of targets) {
		for (const key of ["on", "bri", "fx", "sx", "ix", "pal", "c1", "c2", "c3"] as const) {
			if (seg[key] !== undefined) {
				(target as Record<string, unknown>)[key] = seg[key];
			}
		}
		seg.col?.forEach((color, i) => {
			if (color.length) {
				target.col[i] = color;
			}
		});
	}
}
