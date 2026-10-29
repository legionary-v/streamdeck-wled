import { action } from "@elgato/streamdeck";

import { type ListConfig, ListAction } from "./list-action";

/**
 * Sets or cycles the color palette, switching from Solid to Colorwaves so the palette is visible. As a dial: rotate to scroll palettes, press for Default, tap for a random palette.
 */
@action({ UUID: "com.legionary-v.wled.palette" })
export class Palette extends ListAction {
	protected readonly config: ListConfig = {
		field: "pal",
		setting: "palette",
		noun: "Palette",
		icon: "palette",
		iconColor: "#4dd0e1",
		dataSource: "getPalettes",
		resetId: 0,
		// Colorwaves shows the palette; Solid would only show the primary color.
		solidFallbackEffect: 67,
		items: (client) => client.palettes,
	};
}
