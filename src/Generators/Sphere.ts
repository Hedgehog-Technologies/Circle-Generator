import { Control, ControlAwareInterface, InfoControl, makeButtonControl, makeInputControl } from "../Controller";
import { NeverError } from "../Errors";
import { EventEmitter } from "../EventEmitter";
import { Bounds, GeneratorInterface2D } from "./GeneratorInterface2D";

export enum SphereModes {
  thin = 'thin',
  thick = 'thick',
}

interface SphereState {
  mode: SphereModes;
  width: number;
  height: number;
  depth: number;
  force: boolean;
  layer: number;
}

export class Sphere implements GeneratorInterface2D, ControlAwareInterface {
  public readonly changeEmitter = new EventEmitter<{ event: string, state: SphereState }>();

  private modeSelectElm = document.createElement('select');
  private widthControl!: Control<HTMLInputElement>;
  private heightControl!: Control<HTMLInputElement>;
  private depthControl!: Control<HTMLInputElement>;
  private forceControl!: Control<HTMLInputElement>;
  private layerSliderControl!: Control<HTMLInputElement>;
  private layerInfo = new InfoControl('Layer', 'current');

  constructor(
    private width: number,
    private height: number,
    private depth: number,
    private mode: SphereModes,
    private force: boolean,
    private layer: number,
  ) {
    this.layer = Math.max(0, Math.min(layer, depth - 1));
    this.buildControls();
  }

  // Returns true if the math-space coordinate is inside the ellipsoid
  private inside3D(mx: number, my: number, mz: number): boolean {
    const rx = this.width / 2;
    const ry = this.height / 2;
    const rz = this.depth / 2;
    return (mx * mx) / (rx * rx) + (my * my) / (ry * ry) + (mz * mz) / (rz * rz) <= 1;
  }

  public isFilled(px: number, py: number): boolean {
    const bounds = this.getBounds();
    // Same half-pixel centring transform as Circle
    const mx = -0.5 * (bounds.maxX - 2 * (px + 0.5));
    const my = -0.5 * (bounds.maxY - 2 * (py + 0.5));
    const mz = -0.5 * (this.depth - 2 * (this.layer + 0.5));

    if (!this.inside3D(mx, my, mz)) return false;

    switch (this.mode) {
      case SphereModes.thin:
        // On shell if any face-neighbor is outside
        return (
          !this.inside3D(mx + 1, my, mz) ||
          !this.inside3D(mx - 1, my, mz) ||
          !this.inside3D(mx, my + 1, mz) ||
          !this.inside3D(mx, my - 1, mz) ||
          !this.inside3D(mx, my, mz + 1) ||
          !this.inside3D(mx, my, mz - 1)
        );
      
      case SphereModes.thick:
        // On shell unless all 26 neighbours are inside
        return !(
          this.inside3D(mx + 1, my, mz) &&
          this.inside3D(mx - 1, my, mz) &&
          this.inside3D(mx, my + 1, mz) &&
          this.inside3D(mx, my - 1, mz) &&
          this.inside3D(mx, my, mz + 1) &&
          this.inside3D(mx, my, mz - 1) &&
          this.inside3D(mx + 1, my + 1, mz) &&
          this.inside3D(mx + 1, my - 1, mz) &&
          this.inside3D(mx - 1, my + 1, mz) &&
          this.inside3D(mx - 1, my - 1, mz) &&
          this.inside3D(mx + 1, my, mz + 1) &&
          this.inside3D(mx + 1, my, mz - 1) &&
          this.inside3D(mx - 1, my, mz + 1) &&
          this.inside3D(mx - 1, my, mz - 1) &&
          this.inside3D(mx, my + 1, mz + 1) &&
          this.inside3D(mx, my + 1, mz - 1) &&
          this.inside3D(mx, my - 1, mz + 1) &&
          this.inside3D(mx, my - 1, mz - 1) &&
          this.inside3D(mx + 1, my + 1, mz + 1) &&
          this.inside3D(mx + 1, my + 1, mz - 1) &&
          this.inside3D(mx + 1, my - 1, mz + 1) &&
          this.inside3D(mx + 1, my - 1, mz - 1) &&
          this.inside3D(mx - 1, my + 1, mz + 1) &&
          this.inside3D(mx - 1, my + 1, mz - 1) &&
          this.inside3D(mx - 1, my - 1, mz + 1) &&
          this.inside3D(mx - 1, my - 1, mz - 1)
        );

      default:
        console.error(`Unknown sphere mode: ${this.mode}`);
        throw new NeverError(this.mode);
    }
  }

  public getBounds(): Bounds {
    // Always the full width x height bounding box so the grid doesn't resize between layers
    return { minX: 0, maxX: this.width, minY: 0, maxY: this.height };
  }

  public getDescription(): string {
    return `Sphere-${this.width}x${this.height}x${this.depth}`;
  }

  private updateLayerInfo(): void {
    const isEquator = this.depth % 2 === 1 && this.layer === Math.floor(this.depth / 2);
    const label = isEquator
    ? `${this.layer + 1} / ${this.depth} (equater)`
    : `${this.layer + 1} / ${this.depth}`;
    this.layerInfo.setValue(label);
  }

  private setLayer(layer: number): void {
    this.layer = Math.max(0, Math.min(layer, this.depth - 1));
    this.layerSliderControl.element.value = `${this.layer}`;
    this.updateLayerInfo();
    this.triggerChange('layer');
  }

  private clampAndSyncLayer(): void {
    this.layer = Math.max(0, Math.min(this.layer, this.depth - 1));
    this.layerSliderControl.element.max = `${this.depth - 1}`;
    this.layerSliderControl.element.value = `${this.layer}`;
    this.updateLayerInfo();
  }

  private buildControls(): void {
    for (const item of Object.keys(SphereModes)) {
      const opt = document.createElement('option');
      opt.value = item;
      opt.innerText = item;
      if (item === this.mode) opt.selected = true;
      this.modeSelectElm.appendChild(opt);
    }
    
    this.modeSelectElm.addEventListener('change', () => {
      this.mode = this.modeSelectElm.value as SphereModes;
      this.triggerChange('mode');
    });

    const numAttrs = { min: '1' } as Partial<HTMLInputElement>;

    this.widthControl = makeInputControl('Shape', 'width', 'number', this.width, () => {
      this.width = parseInt(this.widthControl.element.value, 10);
      if (this.force) {
        this.height = this.width;
        this.depth = this.width;
        this.heightControl.element.value = `${this.width}`;
        this.depthControl.element.value = `${this.width}`;
        this.clampAndSyncLayer();
      }
      this.triggerChange('width');
    }, numAttrs);

    this.heightControl = makeInputControl('Shape', 'height', 'number', this.height, () => {
      this.height = parseInt(this.heightControl.element.value, 10);
      if (this.force) {
        this.width = this.height;
        this.depth = this.height;
        this.widthControl.element.value = `${this.height}`
        this.depthControl.element.value = `${this.height}`
        this.clampAndSyncLayer();
      }
      this.triggerChange('height');
    }, numAttrs);

    this.depthControl = makeInputControl('Shape', 'depth', 'number', this.depth, () => {
      this.depth = parseInt(this.depthControl.element.value, 10);
      if (this.force) {
        this.width = this.depth;
        this.height = this.depth;
        this.widthControl.element.value = `${this.depth}`;
        this.heightControl.element.value = `${this.depth}`;
      }
      this.clampAndSyncLayer();
      this.triggerChange('depth');
    }, numAttrs);

    this.forceControl = makeInputControl('Shape', 'Force Sphere', 'checkbox', '1', () => {
      this.force = this.forceControl.element.checked;
      if (this.force) {
        this.height = this.width;
        this.depth = this.width;
        this.heightControl.element.value = `${this.width}`;
        this.depthControl.element.value = `${this.width}`;
        this.clampAndSyncLayer();
      }
      this.triggerChange('force');
    });
    this.forceControl.element.checked = this.force;

    this.layerSliderControl = makeInputControl('Layer', 'layer', 'range', this.layer, () => {
      this.layer = parseInt(this.layerSliderControl.element.value, 10);
      // this.updateLayerInfo();
      this.triggerChange('layer');
    }, { min: '0', max: `${this.depth - 1}`, step: '1' } as Partial<HTMLInputElement>, 250);

    // Label updates immediately, independent of the render debounce
    this.layerSliderControl.element.addEventListener('input', () => {
      this.layer = parseInt(this.layerSliderControl.element.value, 10);
      this.updateLayerInfo();
    });

    this.updateLayerInfo();
  }

  private triggerChange(event: string): void {
    this.changeEmitter.trigger({
      event,
      state: {
        mode: this.mode,
        width: this.width,
        height: this.height,
        depth: this.depth,
        force: this.force,
        layer: this.layer,
      },
    });
  }

  public getControls(): Control[] {
    return [
      this.forceControl,
      this.widthControl,
      this.heightControl,
      this.depthControl,
      { element: this.modeSelectElm, label: 'border', group: 'Render' },
      this.layerSliderControl,
      makeButtonControl('Layer', null, '◀ prev', () => this.setLayer(this.layer - 1)),
      makeButtonControl('Layer', null, 'next ▶', () => this.setLayer(this.layer + 1)),
      this.layerInfo,
    ];
  }
}