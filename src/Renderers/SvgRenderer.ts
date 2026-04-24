import { GeneratorInterface2D } from "../Generators/GeneratorInterface2D";
import { RendererInterface } from "./RendererInterface";
import { Control, ControlAwareInterface, InfoControl, makeButtonControl, makeInputControl } from "../Controller";
import { EventEmitter } from "../EventEmitter";
import { xor } from "../Math";

function isSvgElement(el: Node): el is SVGElement {
	return (el as SVGElement).namespaceURI === "http://www.w3.org/2000/svg";
}

export type CountLabels = 'none' | 'topLeft' | 'all';

interface SvgRendererState {
	scale: number;
	countLabels: CountLabels;
	colorBase: string;
	colorAxis: string;
	colorBuilt: string;
	colorFont: string;
	fontBold: boolean;
}

export class SvgRenderer implements RendererInterface, ControlAwareInterface {

	private countLabels: CountLabels = 'topLeft';
	private dWidth = 5;
	private dBorder = 1;
	private dFull = this.dWidth + this.dBorder;

	private blocks = new InfoControl("Details", "blocks");

	private stacksOf64 = new InfoControl("Details", "stacks of 64");
	private stacksOf16 = new InfoControl("Details", "stacks of 16");

	public readonly changeEmitter = new EventEmitter<SvgRendererState>();

	constructor(
		private scaleSize: number,
		initialCountLabels: CountLabels = 'topLeft',
		private colorBase: string = '#FF0000',
		private colorAxis: string = '#880000',
		private colorBuilt: string = '#7711AA',
		private colorFont: string = 'white',
		private fontBold: boolean = false
	) {
		this.countLabels = initialCountLabels;
	}

	private triggerChange() {
		this.changeEmitter.trigger({
			scale: this.scaleSize,
			countLabels: this.countLabels,
			colorBase: this.colorBase,
			colorAxis: this.colorAxis,
			colorBuilt: this.colorBuilt,
			colorFont: this.colorFont,
			fontBold: this.fontBold
		});
	}

	public getControls(): Control[] {
		const scale = makeInputControl('Render', 'scale', 'range', this.scaleSize, (val) => {
			this.scaleSize = parseInt(val, 10);
			this.scale();

			this.triggerChange();
		}, { min: "100", max: "2000" });

		const countLabelsSelect = document.createElement('select');
		(['none', 'topLeft', 'all'] as CountLabels[]).forEach(opt => {
			const el = document.createElement('option');
			el.value = opt;
			el.text = opt === 'none' ? 'none' : opt === 'topLeft' ? 'top-left quadrant' : 'all quadrants';
			if (opt === this.countLabels) el.selected = true;
			countLabelsSelect.appendChild(el);
		});
		countLabelsSelect.addEventListener('change', () => {
			this.countLabels = countLabelsSelect.value as CountLabels;
			this.triggerChange();
		})

		const colorBase = makeInputControl('Customize', 'Block - Base', 'color', this.colorBase, (val) => {
			this.colorBase = val;
			this.triggerChange();
		}, {}, 250);

		const colorBuilt = makeInputControl('Customize', 'Block - Built', 'color', this.colorBuilt, (val) => {
			this.colorBuilt = val;
			this.triggerChange();
		}, {}, 250);

		const colorAxis = makeInputControl('Customize', 'Block - Axis', 'color', this.colorAxis, (val) => {
			this.colorAxis = val;
			this.triggerChange();
		}, {}, 250);

		const colorFont = makeInputControl('Customize', 'Font - Color', 'color', this.colorFont, (val) => {
			this.colorFont = val;
			this.triggerChange();
		}, {}, 250);

		const fontBold = makeInputControl('Customize', 'Font - Bold', 'checkbox', this.fontBold ? '1' : '0', (_) => {
			this.fontBold = fontBold.element.checked;
			this.triggerChange();
		});

		return [
			scale,
			{ element: countLabelsSelect, label: 'counts', group: 'Render' },

			this.blocks,
			this.stacksOf64,
			this.stacksOf16,

			colorBase,
			colorBuilt,
			colorAxis,
			colorFont,
			fontBold,
			makeButtonControl('Customize', null, 'Reset', async () => {
				this.colorBase = '#FF0000';
				colorBase.element.value = this.colorBase;
				this.colorAxis = '#880000';
				colorAxis.element.value = this.colorAxis;
				this.colorBuilt = '#7711AA';
				colorBuilt.element.value = this.colorBuilt;
				this.colorFont = 'white';
				colorFont.element.value = this.colorFont;
				this.fontBold = false;
				fontBold.element.checked = this.fontBold;
				this.triggerChange();
			}),

			// makeButtonControl('Download', null, 'PNG', async () => {
			// 	if (!this.lastSvg) {
			// 		throw new Error('No SVG to download');
			// 	}

			// 	const canvas = await svgToCanvas(this.lastSvg.outerHTML);
			// 	const dataUrl = canvas.toDataURL();

			// 	const a = document.createElement('a');
			// 	a.href = dataUrl;
			// 	a.download = (this.lastGenerator?.getDescription() || "circle") + "-download.png";
			// 	document.body.appendChild(a);
			// 	a.click();
			// }),

			// makeButtonControl('Download', null, 'SVG', async () => {
			// 	if (!this.lastSvg) {
			// 		throw new Error('No SVG to download');
			// 	}

			// 	const a = document.createElement('a');
			// 	a.href = "data:image/svg+xml;base64," + btoa(this.lastSvg.outerHTML);
			// 	a.download = (this.lastGenerator?.getDescription() || "circle") + "-download.svg";
			// 	document.body.appendChild(a);
			// 	a.click();
			// }),
		];
	}

	private hasInlineSvg(): boolean {
		const div = document.createElement('div');
		div.innerHTML = '<svg/>';
		return Boolean(div.firstChild && isSvgElement(div.firstChild));
	}

	private add(x: number, y: number, width: number, height: number, filled: boolean): string {
		const xp = (((x + 1) * this.dFull) /*+ (this._svg_width / 2)*/ - (this.dFull / 2)) + .5;
		const yp = (((y + 1) * this.dFull) /*+ (this._svg_height / 2)*/ - (this.dFull / 2)) + .5;

		let color: string | null = null;

		const midx = (width / 2) - .5;
		const midy = (height / 2) - .5;

		let extra = "";
		if (filled) {
			if (x == midx || y == midy) {
				color = this.colorAxis;
			} else {
				color = this.colorBase;
			}

			extra = `onclick="this.classList.toggle('built');"`;
		} else if (x == midx || y == midy) {
			if (xor(!!(x & 1), !!(y & 1))) {
				color = '#AAAAAA';
			} else {
				color = '#CCCCCC';
			}
		}

		if (color) {
			const fillstr = (filled ? 'filled' : '');
			return `<rect x="${xp}" y="${yp}" fill="${color}" width="${this.dWidth}" height="${this.dWidth}" class="${fillstr}" data-x="${x}" data-y="${y}" ${extra}/>`;
		}

		return '';
	}

	private lastSvg: SVGElement | null = null;

	public render(target: HTMLElement, generator: GeneratorInterface2D): void {
		if (!this.hasInlineSvg()) {
			throw new Error(`SVG Renderer: No support for inline SVG. Please use a browser that supports SVG.`);
		}

		const svg = this.generateSVG(generator);

		target.innerHTML = svg;
		// const svgElm = target.firstChild as SVGElement;

		this.lastSvg = target.querySelector('svg');

		this.scale();
	}

	// private lastGenerator: GeneratorInterface2D | null = null;

	private generateSVG(generator: GeneratorInterface2D): string {
		// this.lastGenerator = generator;
		const { minX, maxX, minY, maxY } = generator.getBounds();
		const width = maxX - minX;
		const height = maxY - minY;
		const svgWidth = this.dFull * (width + 1);
		const svgHeight = this.dFull * (height + 1);
		const half = this.dWidth / 2;
		const centerX = width / 2;
		const centerY = height / 2;

		// TODO - double click number to mark section as 'built'
		// TODO - click and drag to marked filled squares as 'built'

		let text = `<svg id="svg_circle"
			xmlns="http://www.w3.org/2000/svg"
			data-w="${svgWidth}" data-h="${svgHeight}"
			width="${svgWidth}px" height="${svgHeight}px"
			viewBox="0 0 ${svgWidth} ${svgHeight}">
			<style>
				.filled {
					cursor: pointer;
					transition: fill 0.3s;
				}

				.filled:hover {
					fill: ${this.colorBuilt};
				}

				.filled.built {
					fill: ${this.colorBuilt};
				}

				.filled.built:hover {
					fill: inherit;
				}
			</style>
		`;

		const perimeterGrid = new Uint8Array(width * height);
		const filledGrid = new Uint8Array(width * height);

		for (let y = minY; y < maxY; y++) {
			for (let x = minX; x < maxX; x++) {
				if (generator.isFilled(x, y)) {
					filledGrid[(y - minY) * width + (x - minX)] = 1;
				}
			}
		}

		const isFilledAt = (gx: number, gy: number): boolean => {
			if (gx < minX || gx >= maxX || gy < minY || gy >= maxY) return false;
			return filledGrid[(gy - minY) * width + (gx - minX)] === 1;
		}

		// const isPerimeterAt = (gx: number, gy: number): boolean => {
		// 	if (gx < minX || gx >= maxX || gy < minY || gy >= maxY) return false;
		// 	return perimeterGrid[(gy - minY) * width + (gx - minX)] === 1;
		// }

		let fillCount = 0;
		for (let y = minY; y < maxY; y++) {
			for (let x = minX; x < maxX; x++) {
				const filled = isFilledAt(x, y);
				text += this.add(x, y, width, height, filled);
				if (filled) {
					const isPerimeter =
						!isFilledAt(x + 1, y) || !isFilledAt(x - 1, y) ||
						!isFilledAt(x, y + 1) || !isFilledAt(x, y - 1);
					if (isPerimeter) {
						fillCount++;
						if (!isFilledAt(x - 1, y) || !isFilledAt(x, y + 1)) perimeterGrid[(y - minY) * width + (x - minX)] = 1;
					}
				}
			}
		}

		this.blocks.setValue(`${fillCount}`);
		this.stacksOf64.setValue(`${(fillCount / 64).toFixed(1)}`);
		this.stacksOf16.setValue(`${(fillCount / 16).toFixed(1)}`);

		
		if (this.countLabels !== 'none') {
			const midX = minX + Math.floor(width / 2);
			const midY = minY + Math.floor(height / 2);
			const countPrintBuffer = new Array<{col: number, row: number, count: number}>(width * height);

			const renderQuadrantLabels = (
				xFrom: number, xTo: number, xDir: 1 | -1,
				yFrom: number, yTo: number, yDir: 1 | -1
			) => {
				const inXRange = (x: number) => xDir > 0 ? x < xTo : x >= xTo;
				const inYRange = (y: number) => yDir > 0 ? y < yTo : y >= yTo;
				const prevRowOffset = -yDir;
				const prevColOffset = -xDir;

				// Horizontal labels: one per row - find the outermost filled cell in xDir
				// extend only through cells not already covered by the previous row
				for (let y = yFrom; inYRange(y); y += yDir) {
					let x = xFrom;
					while (inXRange(x) && !isFilledAt(x, y)) x += xDir;
					if (!inXRange(x)) continue;

					const xStart = x;
					let runLength = 1;
					let nextX = x + xDir;
					const isFirstRow = y === yFrom;

					if (isFirstRow) {
						while (inXRange(nextX) && isFilledAt(nextX, y)) {
							runLength++;
							nextX += xDir;
						}
					} else {
						while (inXRange(nextX) && isFilledAt(nextX, y) && !isFilledAt(nextX, y + prevRowOffset)) {
							runLength++;
							nextX += xDir;
						}
					}

					// Skip trivial 1-wide step already inside vertical run
					if (runLength === 1 && isFilledAt(xStart, y + prevRowOffset)) continue;

					const key = (y - minY) * width + (xStart - minX);
					if (countPrintBuffer[key] !== undefined && countPrintBuffer[key].count >= runLength) continue;
					countPrintBuffer[key] = { col: xStart, row: y, count: runLength };
				}

				// Vertical labels: one per column - find the outermost filled cell in yDir
				// skip if it's already inside an H run, extend only through cells not covered
				// by the previous column
				for (let x = xFrom; inXRange(x); x += xDir) {
					let y = yFrom;
					while (inYRange(y) && !isFilledAt(x, y)) y += yDir;
					if (!inYRange(y)) continue;

					const yStart = y;
					const isFirstCol = x === xFrom;

					// Skip if the outermost block has a filled neighbor in the prevCol direction
					// (meaning it's interior to a horizontal run)
					if (!isFirstCol && isFilledAt(x + prevColOffset, yStart)) continue;

					let runLength = 1;
					let nextY = y + yDir;

					if (isFirstCol) {
						while (inYRange(nextY) && isFilledAt(x, nextY)) {
							runLength++;
							nextY += yDir;
						}
					} else {
						while (inYRange(nextY) && isFilledAt(x, nextY) && !isFilledAt(x + prevColOffset, nextY)) {
							runLength++;
							nextY += yDir;
						}
					}

					const key = (yStart - minY) * width + (x - minX);
					if (countPrintBuffer[key] !== undefined && countPrintBuffer[key].count >= runLength) continue;
					countPrintBuffer[key] = { col: x, row: yStart, count: runLength };
				}
			};

			if (this.countLabels === 'topLeft') {
				renderQuadrantLabels(minX, midX, 1, minY, midY, 1);
			} else {
				renderQuadrantLabels(minX, midX, 1, minY, midY, 1); // top-left
				renderQuadrantLabels(maxX - 1, midX, -1, minY, midY, 1); // top-right
				renderQuadrantLabels(minX, midX, 1, maxY - 1, midY, -1); // bottom-left
				renderQuadrantLabels(maxX - 1, midX, -1, maxY - 1, midY, -1); // bottom-right
			}

			countPrintBuffer.forEach(val => text += this.getCountLabel(val.col, val.row, val.count));
		}

		

		// vertical grid lines
		text += this.renderGridLines(width, svgHeight, half, centerX, true);
		// horizontal grid lines
		text += this.renderGridLines(height, svgWidth, half, centerY, false);

		text += `</svg>`;
		return text;
	}

	private getCountLabel(col: number, row: number, count: number) {
		const xp = (((col + 1) * this.dFull) - (this.dFull / 2)) + 0.5;
		const yp = (((row + 1) * this.dFull) - (this.dFull / 2)) + 0.5;
		return `<text x="${xp + this.dWidth / 2}" y="${yp + this.dWidth / 2}" font-size="3" fill="${this.colorFont}" `
			+ `text-anchor="middle" dominant-baseline="middle" pointer-events="none"
			+ ${this.fontBold ? 'style="font-weight: bold;"' : ''}">${count}</text>`;
	}

	private renderGridLines(
		count: number,
		length: number,
		offset: number,
		center: number,
		vertical: boolean
	): string {
		let svg = '';
		for (let i = 0; i <= count; i++) {
			const atCenter = i === center;
			const fill = atCenter ? this.colorAxis : '#bbbbbb';
			const opacity = atCenter ? '1' : '.3';
			if (vertical) {
				svg += `<rect x="${i * this.dFull + offset}" y="0" fill="${fill}"
						 width="${this.dBorder}" height="${length}" opacity="${opacity}" />`;
			} else {
				svg += `<rect x="0" y="${i * this.dFull + offset}" fill="${fill}"
						 width="${length}" height="${this.dBorder}" opacity="${opacity}" />`;
			}
		}
		return svg;
	}


	private scale() {
		if (!this.lastSvg) {
			throw new Error("Error finding svg_circle");
		}
		const h = this.lastSvg.getAttribute('data-h');
		const w = this.lastSvg.getAttribute('data-w');
		if (!h || !w) {
			throw new Error("error getting requisite data attributes");
		}

		const wn = parseInt(w, 10);
		const hn = parseInt(h, 10);

		const aspect = hn / wn;

		let scale = this.scaleSize;
		scale = scale * (wn * .01);

		const scaleX = scale;
		const scaleY = scale * aspect;

		this.lastSvg.setAttribute('width', scaleX + 'px');
		this.lastSvg.setAttribute('height', scaleY + 'px');
		this.lastSvg.style.width = scaleX + 'px';
		this.lastSvg.style.height = scaleY + 'px';
	}
}
