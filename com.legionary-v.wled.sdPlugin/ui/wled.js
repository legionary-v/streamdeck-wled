/**
 * Shared property inspector markup. `<wled-device>` renders the device picker (and, with the `segments` attribute,
 * the segment picker) used by every action. The plugin answers the `datasource` requests.
 */
customElements.define(
	"wled-device",
	class extends HTMLElement {
		connectedCallback() {
			if (this.childElementCount > 0) return;
			this.innerHTML = `
				<sdpi-item label="Device">
					<sdpi-select setting="host" datasource="getDevices" hot-reload loading="Searching…" default=""></sdpi-select>
				</sdpi-item>
				<sdpi-item label="Custom host">
					<sdpi-textfield setting="customHost" placeholder="Optional IP or hostname"></sdpi-textfield>
				</sdpi-item>
				<sdpi-item label="Default device">
					<sdpi-textfield setting="defaultHost" global placeholder="Auto-discovered"></sdpi-textfield>
				</sdpi-item>
				${
					this.hasAttribute("segments")
						? `<sdpi-item label="Segment">
					<sdpi-select setting="segment" datasource="getSegments" hot-reload default=""></sdpi-select>
				</sdpi-item>`
						: ""
				}
				<hr class="wled-divider" />`;
		}
	},
);

const style = document.createElement("style");
style.textContent = `
	.wled-divider { border: 0; border-top: 1px solid #3d3d3d; margin: 10px 0; }
	.wled-hint { color: #969696; font-size: 9pt; line-height: 1.4; margin: 4px 0 0 0; }
`;
document.head.appendChild(style);
