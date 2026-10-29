import streamDeck from "@elgato/streamdeck";

import { Brightness } from "./actions/brightness";
import { Color } from "./actions/color";
import { CustomJson } from "./actions/custom-json";
import { Effect } from "./actions/effect";
import { EffectParameter } from "./actions/effect-parameter";
import { Palette } from "./actions/palette";
import { Power } from "./actions/power";
import { Preset } from "./actions/preset";
import { wled } from "./wled/manager";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new Power());
streamDeck.actions.registerAction(new Brightness());
streamDeck.actions.registerAction(new Color());
streamDeck.actions.registerAction(new Effect());
streamDeck.actions.registerAction(new Palette());
streamDeck.actions.registerAction(new EffectParameter());
streamDeck.actions.registerAction(new Preset());
streamDeck.actions.registerAction(new CustomJson());

await streamDeck.connect();
await wled.init();
