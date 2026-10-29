import { action } from "@elgato/streamdeck";

import { type ListConfig, ListAction } from "./list-action";

/**
 * Sets or cycles the effect. As a dial: rotate to scroll effects, press for Solid, tap for a random effect.
 */
@action({ UUID: "com.legionary-v.wled.effect" })
export class Effect extends ListAction {
	protected readonly config: ListConfig = {
		field: "fx",
		setting: "effect",
		noun: "Effect",
		icon: "effect",
		iconColor: "#b388ff",
		dataSource: "getEffects",
		resetId: 0,
		items: (client) => client.effects,
	};
}
