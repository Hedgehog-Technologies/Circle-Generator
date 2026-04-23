/*!
Copyright (c) Jesse G. Donat and contributors. Licensed under the MIT License.

This notice may not be removed or altered from any source distribution.
*/

import { GeneratorInterface2D } from "./Generators/GeneratorInterface2D";
import { CountLabels, SvgRenderer } from "./Renderers/SvgRenderer";
import { RendererInterface } from "./Renderers/RendererInterface";
import { Circle, CircleModes } from "./Generators/Circle";
import { Sphere, SphereModes } from "./Generators/Sphere";
import { StateHandler, StateItem } from "./State";

export interface Control<T extends HTMLElement = HTMLElement> {
	element: T;
	label: string | null;
	group: string;
}

export interface ControlAwareInterface {
	getControls(): Control[];
}

export function isControlAwareInterface(o: any): o is ControlAwareInterface {
	return o && (typeof o.getControls === "function");
}

export class InfoControl implements Control<HTMLOutputElement> {
	public element: HTMLOutputElement = document.createElement("output");

	constructor(public group: string, public label: string | null) { }

	public setValue(value: string) {
		this.element.value = value;
	}
}

export function makeButtonControl(
	group: string,
	label: string | null,
	text: string,
	onClick: (e: MouseEvent) => void
): Control<HTMLButtonElement> {
	const button = document.createElement("button");
	button.innerText = text;

	button.addEventListener("click", onClick);

	return {
		element: button,
		label,
		group,
	};
}

export function makeInputControl(
	group: string,
	label: string | null,
	type: string,
	value: string | number,
	onAlter: (val: string) => void,
	attributes?: Partial<HTMLInputElement>,
	debounceMs: number = 50
): Control<HTMLInputElement> {
	const controlElm = document.createElement("input");

	if (attributes) {
		Object.assign(controlElm, attributes);
	}

	controlElm.type = type;
	controlElm.value = `${value}`;

	let timeout: ReturnType<typeof setTimeout>;
	const handler = () => {
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			onAlter(controlElm.value);
		}, debounceMs);
	};
	controlElm.addEventListener("change", handler);
	controlElm.addEventListener("keyup", handler);
	controlElm.addEventListener("input", handler);

	return {
		label,
		group,
		element: controlElm,
	};
}

export class MainController {

	private stateMananger = new StateHandler();

	private generator!: GeneratorInterface2D;
	private shapeTypeState!: StateItem<{ type: 'circle' | 'sphere' }>;

	private renderer: RendererInterface;

	constructor(private controls: HTMLElement, private result: HTMLElement) {
		const svgState = this.stateMananger.get("svgRenderer", { scale: 500, countLabels: 'topLeft' });
		const svgRenderer = new SvgRenderer(svgState.get('scale'), svgState.get('countLabels') as CountLabels);
		this.renderer = svgRenderer;

		svgRenderer.changeEmitter.add((e) => {
			svgState.set('scale', e.scale);
			svgState.set('countLabels', e.countLabels);
		});
		this.renderer.changeEmitter.add(() => { this.render(); });

		this.shapeTypeState = this.stateMananger.get('shapeType', { type: 'circle' });

		if (this.shapeTypeState.get('type') === 'sphere') {
			this.initSphere();
		} else {
			this.initCircle(true);
		}

		this.makeResultDraggable();
	}
	
	private initCircle(allowDialog: boolean): void {
		const circleState = this.stateMananger.get('circle', {
			mode: CircleModes.thin,
			width: 13,
			height: 13,
			force: true,
		});

		const w = circleState.get('width');
		const h = circleState.get('height');

		const circle = new Circle(w, h, circleState.get('mode'), circleState.get('force'));
		this.generator = circle;
		this.generator.changeEmitter.add(() => { this.render(); });

		circle.changeEmitter.add((e) => {
			circleState.set('mode', e.state.mode);
			circleState.set('width', e.state.width);
			circleState.set('height', e.state.height);
			circleState.set('force', e.state.force);
		});

		if (allowDialog && w * h > 200 * 200) {
			const dlg = document.createElement('dialog');
			dlg.innerText = `Do you want to re-render the saved ${w} x ${h} shape? This may take a while or freeze.`;

			const frm = document.createElement('form');
			frm.method = 'dialog';

			const btnYes = document.createElement('button');
			btnYes.value = 'yes';
			btnYes.innerText = 'Yes';
			btnYes.addEventListener('click', () => dlg.close('yes'));

			const btnNo = document.createElement('button');
			btnNo.value = 'no';
			btnNo.innerText = 'No';
			btnNo.addEventListener('click', () => dlg.close('no'));

			frm.appendChild(btnYes);
			frm.appendChild(btnNo);
			frm.style.padding = '1em';
			frm.style.display = 'flex';
			frm.style.columnGap = '1em';

			dlg.appendChild(frm);

			dlg.addEventListener('close', () => {
				document.body.removeChild(dlg);
				if (dlg.returnValue === 'yes') {
					this.renderControls();
					this.render();
				} else {
					circleState.set('width', 5);
					circleState.set('height', 5);
					window.location.reload();
				}
			});

			document.body.appendChild(dlg);
			dlg.showModal();
			return;
		}

		this.renderControls();
		this.render();
	}

	private initSphere(): void {
		const sphereState = this.stateMananger.get('sphere', {
			mode: SphereModes.thin,
			width: 13,
			height: 13,
			depth: 13,
			force: true,
			layer: 6,
		});

		const sphere = new Sphere(
			sphereState.get('width'),
			sphereState.get('height'),
			sphereState.get('depth'),
			sphereState.get('mode'),
			sphereState.get('force'),
			sphereState.get('layer'),
		);
		this.generator = sphere;
		this.generator.changeEmitter.add(() => { this.render(); });

		sphere.changeEmitter.add((e) => {
			sphereState.set('mode', e.state.mode);
			sphereState.set('width', e.state.width);
			sphereState.set('height', e.state.height);
			sphereState.set('depth', e.state.depth);
			sphereState.set('force', e.state.force);
			sphereState.set('layer', e.state.layer);
		});

		this.renderControls();
		this.render();
	}

	private makeResultDraggable() {
		let isDown = false;
		const el = this.result;

		el.style.cursor = "grab";
		el.style.userSelect = "none";
		// el.style.touchAction = "none";

		el.addEventListener("pointerdown", (e: PointerEvent) => {
			const target = e.target as HTMLElement|SVGElement|null;
			if (target && target.classList.contains("filled")) {
				return;
			}

			if (e.pointerType !== "mouse") return;
			isDown = true;
			el.setPointerCapture(e.pointerId);
			el.style.cursor = "grabbing";
		});

		el.addEventListener("pointermove", (e: PointerEvent) => {
			if (!isDown) return;
			el.scrollBy(-e.movementX, -e.movementY);
		});

		el.addEventListener("pointerup", (e: PointerEvent) => {
			if (e.pointerType !== "mouse") return;
			isDown = false;
			el.releasePointerCapture(e.pointerId);
			el.style.cursor = "grab";
		});
	}


	private renderControls() {
		this.controls.innerHTML = '';

		// Shape type selector
		const shapeGroup = document.createElement('fieldset');
		const shapeLegend = document.createElement('legend');
		shapeLegend.innerText = 'Shape';
		shapeGroup.appendChild(shapeLegend);

		const shapeLabel = document.createElement('label');
		shapeLabel.innerText = 'type ';
		const shapeSelect = document.createElement('select');
		for (const t of ['circle', 'sphere'] as const) {
			const opt = document.createElement('option');
			opt.value = t;
			opt.innerText = t;
			if (t === this.shapeTypeState.get('type')) opt.selected = true;
			shapeSelect.appendChild(opt);
		}
		shapeSelect.addEventListener('change', () => {
			const chosen = shapeSelect.value as 'circle' | 'sphere';
			this.shapeTypeState.set('type', chosen);
			if (chosen === 'sphere') {
				this.initSphere();
			} else {
				this.initCircle(false);
			}
		});
		shapeLabel.appendChild(shapeSelect);
		shapeGroup.appendChild(shapeLabel);
		this.controls.appendChild(shapeGroup);

		const controlProviders = [this.generator, this.renderer];

		const controlGroups: { [key: string]: Control[] } = {};

		for (const controlProvider of controlProviders) {
			if (isControlAwareInterface(controlProvider)) {
				for (const c of controlProvider.getControls()) {
					if (!controlGroups[c.group]) {
						controlGroups[c.group] = [];
					}

					controlGroups[c.group].push(c);
				}
			}
		}

		for (const group in controlGroups) {
			if (!controlGroups.hasOwnProperty(group)) {
				continue;
			}

			const groupElm = document.createElement("fieldset");
			const legend = document.createElement("legend");
			legend.innerText = group;
			groupElm.appendChild(legend);

			for (const c of controlGroups[group]) {

				const labelElm = document.createElement("label");
				groupElm.appendChild(labelElm);

				if (c.label) {
					labelElm.innerText = c.label;
				}

				labelElm.appendChild(c.element);
			}

			this.controls.appendChild(groupElm);
		}
	}

	private render() {
		this.renderer.render(this.result, this.generator);
	}

}
