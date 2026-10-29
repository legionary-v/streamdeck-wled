/**
 * Icon artwork on a 24x24 grid, as SVG fragments. `{c}` is replaced with the icon color.
 *
 * This file has no imports so that `scripts/generate-icons.mjs` can load it directly to render the static manifest icons.
 */
export const ICONS = {
	power: `<g fill="none" stroke="{c}" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/></g>`,
	brightness: `<g stroke="{c}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="{c}"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g>`,
	color: `<path d="M12 2.5C12 2.5 5 10.2 5 14.8a7 7 0 0 0 14 0C19 10.2 12 2.5 12 2.5Z" fill="{c}"/>`,
	effect: `<g fill="{c}"><path d="M10 2.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5-6.5-2 6.5-2Z"/><path d="M18.5 13.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/></g>`,
	palette: `<path d="M12 2.5a9.5 9.5 0 1 0 0 19c1.2 0 1.9-.9 1.9-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .9-1.9 1.9-1.9h2.2a4.9 4.9 0 0 0 4.9-4.9C21.9 6 17.5 2.5 12 2.5Z" fill="{c}"/><g fill="#1b1b1f"><circle cx="6.8" cy="11.5" r="1.6"/><circle cx="9.3" cy="7" r="1.6"/><circle cx="14.7" cy="7" r="1.6"/><circle cx="17.4" cy="11.3" r="1.6"/></g>`,
	speed: `<g fill="none" stroke="{c}" stroke-width="2.2" stroke-linecap="round"><path d="M4.2 17.5a9 9 0 1 1 15.6 0"/><path d="M12 14l4.5-5"/></g><circle cx="12" cy="14" r="1.8" fill="{c}"/>`,
	preset: `<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8Z" fill="{c}"/>`,
	json: `<g fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H7a2 2 0 0 0-2 2v3.5a2.5 2.5 0 0 1-2 2.5 2.5 2.5 0 0 1 2 2.5V18a2 2 0 0 0 2 2h1"/><path d="M16 4h1a2 2 0 0 1 2 2v3.5a2.5 2.5 0 0 0 2 2.5 2.5 2.5 0 0 0-2 2.5V18a2 2 0 0 1-2 2h-1"/></g>`,
	wled: `<g fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round"><path d="M3 9c3-3 6 3 9 0s6 3 9 0"/><path d="M3 15c3-3 6 3 9 0s6 3 9 0"/></g><g fill="{c}"><circle cx="7.5" cy="9" r="1.4"/><circle cx="16.5" cy="9" r="1.4"/><circle cx="7.5" cy="15" r="1.4"/><circle cx="16.5" cy="15" r="1.4"/></g>`,
} as const;

export type IconName = keyof typeof ICONS;

/** Returns the icon's SVG fragment in the given color. */
export function icon(name: IconName, color: string): string {
	return ICONS[name].replaceAll("{c}", color);
}
