import { GeneratorInterface2D } from "../Generators/GeneratorInterface2D";
import { RendererInterface } from "./RendererInterface";
import { Control, ControlAwareInterface, InfoControl, makeButtonControl, makeInputControl } from "../Controller";
import { EventEmitter } from "../EventEmitter";
import { xor } from "../Math";
import { svgToCanvas } from "../Utils";

function isSvgElement(el: Node): el is SVGElement {
	return (el as SVGElement).namespaceURI === "http://www.w3.org/2000/svg";
}

export type CountLabels = 'none' | 'topLeft' | 'all';

interface SvgRendererState {
	scale: number;
	countLabels: CountLabels;
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

	constructor(private scaleSize: number, initialCountLabels: CountLabels = 'topLeft') {
		this.countLabels = initialCountLabels;
	}

	private triggerChange() {
		this.changeEmitter.trigger({
			scale: this.scaleSize,
			countLabels: this.countLabels,
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

		return [
			scale,
			{ element: countLabelsSelect, label: 'counts', group: 'Render' },

			makeButtonControl('Download', null, 'PNG', async () => {
				if (!this.lastSvg) {
					throw new Error('No SVG to download');
				}

				const canvas = await svgToCanvas(this.lastSvg.outerHTML);
				const dataUrl = canvas.toDataURL();

				const a = document.createElement('a');
				a.href = dataUrl;
				a.download = (this.lastGenerator?.getDescription() || "circle") + "-download.png";
				document.body.appendChild(a);
				a.click();
			}),

			makeButtonControl('Download', null, 'SVG', async () => {
				if (!this.lastSvg) {
					throw new Error('No SVG to download');
				}

				const a = document.createElement('a');
				a.href = "data:image/svg+xml;base64," + btoa(this.lastSvg.outerHTML);
				a.download = (this.lastGenerator?.getDescription() || "circle") + "-download.svg";
				document.body.appendChild(a);
				a.click();
			}),

			this.blocks,
			this.stacksOf64,
			this.stacksOf16,
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
				color = '#880000';
			} else {
				color = '#FF0000';
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

	private lastGenerator: GeneratorInterface2D | null = null;

	private generateSVG(generator: GeneratorInterface2D): string {
		this.lastGenerator = generator;
		const { minX, maxX, minY, maxY } = generator.getBounds();
		const width = maxX - minX;
		const height = maxY - minY;
		const svgWidth = this.dFull * (width + 1);
		const svgHeight = this.dFull * (height + 1);
		const half = this.dWidth / 2;
		const centerX = width / 2;
		const centerY = height / 2;

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
					fill: #7711AA;
				}

				.filled.built {
					fill: #7711AA;
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

		const isPerimeterAt = (gx: number, gy: number): boolean => {
			if (gx < minX || gx >= maxX || gy < minY || gy >= maxY) return false;
			return perimeterGrid[(gy - minY) * width + (gx - minX)] === 1;
		}

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

		// let fillCount = 0;
		// for (let y = minY; y < maxY; y++) {
		// 	for (let x = minX; x < maxX; x++) {
		// 		const filled = generator.isFilled(x, y);
		// 		text += this.add(x, y, width, height, filled);
		// 		if (filled) fillCount++;
		// 	}
		// }

		this.blocks.setValue(`${fillCount}`);
		this.stacksOf64.setValue(`${(fillCount / 64).toFixed(1)}`);
		this.stacksOf16.setValue(`${(fillCount / 16).toFixed(1)}`);

		if (this.countLabels !== 'none') {
    const xEnd = this.countLabels === 'topLeft' ? minX + Math.floor(width / 2) : maxX;
    const yEnd = this.countLabels === 'topLeft' ? minY + Math.floor(height / 2) : maxY;

    const emitHLabel = (startX: number, row: number, count: number) => {
        const xp = (((startX + 1) * this.dFull) - (this.dFull / 2)) + 0.5;
        const yp = (((row + 1) * this.dFull) - (this.dFull / 2)) + 0.5;
        text += `<text x="${xp + this.dWidth / 2}" y="${yp + this.dWidth / 2}" font-size="3" fill="white" `
            + `text-anchor="middle" dominant-baseline="middle">${count}</text>`;
    };

    const emitVLabel = (col: number, startY: number, count: number) => {
        const xp = (((col + 1) * this.dFull) - (this.dFull / 2)) + 0.5;
        const yp = (((startY + 1) * this.dFull) - (this.dFull / 2)) + 0.5;
        text += `<text x="${xp + this.dWidth / 2}" y="${yp + this.dWidth / 2}" font-size="3" fill="white" `
            + `text-anchor="middle" dominant-baseline="middle">${count}</text>`;
    };

    // Horizontal labels (templogic findHorizontalRuns, axes mapped: row=y, col=x)
    // For each row, find the first filled cell, extend right only through cells
    // not already covered by the row above. One label per row.
    for (let y = minY; y < yEnd; y++) {
        // Find leftmost filled cell in this row
        let x = minX;
        while (x < xEnd && !isFilledAt(x, y)) x++;
        if (x >= xEnd) continue;

        const xStart = x;
        let runLength = 1;
        let nextX = x + 1;

        if (y === minY) {
            // First row: count all consecutive filled cells
            while (nextX < xEnd && isFilledAt(nextX, y)) {
                runLength++;
                nextX++;
            }
        } else {
            // Other rows: only extend while the cell in the row above is empty
            while (nextX < xEnd && isFilledAt(nextX, y) && !isFilledAt(nextX, y - 1)) {
                runLength++;
                nextX++;
            }
        }

        emitHLabel(xStart, y, runLength);
    }

    // Vertical labels (templogic findVerticalRuns, axes mapped: col=x, row=y)
    // For each column, find the first filled cell, extend down only through cells
    // not already covered by the column to its left. One label per column.
    for (let x = minX; x < xEnd; x++) {
        // Find topmost filled cell in this column
        let y = minY;
        while (y < yEnd && !isFilledAt(x, y)) y++;
        if (y >= yEnd) continue;

        const yStart = y;
        let runLength = 1;
        let nextY = y + 1;

        if (x === minX) {
            // First column: count all consecutive filled cells downward
            while (nextY < yEnd && isFilledAt(x, nextY)) {
                runLength++;
                nextY++;
            }
        } else {
            // Other columns: only extend while the cell in the column to the left is empty
            while (nextY < yEnd && isFilledAt(x, nextY) && !isFilledAt(x - 1, nextY)) {
                runLength++;
                nextY++;
            }
        }

        emitVLabel(x, yStart, runLength);
    }
}

		// vertical grid lines
		text += this.renderGridLines(width, svgHeight, half, centerX, true);
		// horizontal grid lines
		text += this.renderGridLines(height, svgWidth, half, centerY, false);

		text += `</svg>`;
		return text;
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
			const fill = atCenter ? '#880000' : '#bbbbbb';
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
