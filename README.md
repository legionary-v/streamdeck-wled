# WLED for Stream Deck

Control [WLED](https://kno.wled.ge/) devices from your Stream Deck — locally, over WLED's WebSocket API. No cloud, no Home Assistant, no extra services.

- **Keys and dials** for power, brightness, color, effects, palettes, effect speed/intensity, and presets
- **Live state**: keys and touch strips reflect the device as it changes, including changes made in the WLED app
- **Auto-discovery** of WLED devices on your network (mDNS), or enter an IP address
- **Multiple devices and segments**: each action can target its own device and segment
- **Default profiles** for Stream Deck (15-key) and Stream Deck +

## Actions

| Action | Key | Dial (Stream Deck +) |
| --- | --- | --- |
| **Power** | Toggle, on, or off. Shows the current state in the light's color. | — |
| **Brightness** | Set a level, or step brighter/dimmer. | Rotate to adjust · press/tap to toggle power |
| **Color** | Apply a color to the primary, secondary, or tertiary slot. Switches to the Solid effect and "Color 1" palette so the color shows (optional). | Rotate to change hue (or saturation) · press to switch · tap for white |
| **Effect** | Set an effect, or next/previous/random. | Rotate to scroll effects · press for Solid · tap for random |
| **Palette** | Set a palette, or next/previous/random. Shows a palette preview. Switches from Solid to Colorwaves so the palette shows. | Rotate to scroll palettes · press for Default · tap for random |
| **Effect Speed / Intensity** | Set or step speed, intensity, or custom sliders 1–3. | Rotate to adjust · press/tap to reset to 50% |
| **Preset** | Apply a preset/playlist, or next/previous. | Rotate to choose · press/tap to apply |
| **Custom JSON** | Send any [JSON API](https://kno.wled.ge/interfaces/json-api/) command. | — |

Keys highlight with a blue border when their setting is the active one (e.g. the current effect or color).

## Default profiles

Installing the plugin adds a **WLED** profile for each supported device (it doesn't switch to it automatically — pick it from the profile list in Stream Deck):

**Stream Deck (15-key)**

| | | | | |
| --- | --- | --- | --- | --- |
| Power | Dimmer | Brighter | Prev effect | Next effect |
| Red | Green | Blue | Warm white | Purple |
| Rainbow | Fire 2012 | Aurora | Prev palette | Next palette |

**Stream Deck +** (two pages; swipe the touch strip to switch)

| Page | Keys | Dials |
| --- | --- | --- |
| WLED | Power, Rainbow, Fire 2012, Random effect · Red, Green, Blue, Warm white | Brightness, Hue, Effect, Palette |
| WLED Effects | Power, Prev/Next effect, Random palette · Aurora, Colortwinkles, Pacifica, Candle | Speed, Intensity, Saturation, Preset |

## Setup

1. Install the plugin (see [Development](#development) to build it yourself).
2. Drag an action onto a key or dial. If a WLED device is found on your network it's used automatically.
3. To choose a device, use the **Device** dropdown, or type an IP/hostname in **Custom host**. **Default device** sets the device for every action that doesn't pick one.

Segment options: by default actions apply to all *selected* segments (as in the WLED UI). Choose a specific segment to target only that one.

> **macOS:** Stream Deck needs *Local Network* access (System Settings → Privacy & Security → Local Network) to reach your devices.

## Requirements

- Stream Deck 7.1 or later (macOS 12+ or Windows 10+)
- WLED 0.14 or later (tested with 16.0)

## Development

Requires [Node.js](https://nodejs.org/) 24+.

```sh
npm install
npm run build                       # bundle the plugin into com.legionary-v.wled.sdPlugin/bin
npx streamdeck link com.legionary-v.wled.sdPlugin   # install the plugin into Stream Deck (once)
npm run watch                       # rebuild and restart the plugin on changes
```

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check the TypeScript sources |
| `npm run validate` | Validate the plugin with the Stream Deck CLI |
| `npm run pack` | Build a distributable `.streamDeckPlugin` into `dist/` |
| `npm run icons` | Regenerate the PNG icons from `src/render/icons.ts` |
| `npm run profiles` | Regenerate the default profiles from `scripts/build-profiles.mjs` |

### How it works

- `src/wled/client.ts` keeps one WebSocket per device (`ws://<host>/ws`), receives state pushes, and sends state updates. Rapid dial turns are coalesced (one message per 50 ms) and applied optimistically so dials feel immediate. Effect, palette, and preset lists are fetched over HTTP from the device's JSON API.
- `src/wled/discovery.ts` finds devices over mDNS (`_wled._tcp`, and `_http._tcp` services confirmed via `/json/info`, since newer WLED releases only advertise the latter).
- `src/actions/` contains one class per action; `wled-action.ts` is the shared base that binds instances to devices, renders keys/dials, and answers property inspector dropdown requests.
- `src/render/` draws key images and touch strip graphics as SVG.
- Property inspectors (`com.legionary-v.wled.sdPlugin/ui/`) use a bundled copy of [sdpi-components](https://sdpi-components.dev/) so they work offline.

## License

[MIT](LICENSE)
