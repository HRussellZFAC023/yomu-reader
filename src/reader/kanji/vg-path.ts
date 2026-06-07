export interface SvgPathPoint {
    x: number;
    y: number;
}

const SVG_PATH_TOKEN = /[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi;
const CURVE_STEPS = 10;

type PathCommandReader = (sampler: SvgPathSampler, relative: boolean) => boolean;

const PATH_COMMAND_READERS: Record<string, PathCommandReader> = {
    M: (sampler, relative) => sampler.readMove(relative),
    L: (sampler, relative) => sampler.readLines(relative),
    H: (sampler, relative) => sampler.readHorizontalLines(relative),
    V: (sampler, relative) => sampler.readVerticalLines(relative),
    C: (sampler, relative) => sampler.readCubics(relative),
    S: (sampler, relative) => sampler.readSmoothCubics(relative),
    Q: (sampler, relative) => sampler.readQuadratics(relative),
    T: (sampler, relative) => sampler.readSmoothQuadratics(relative),
    A: (sampler, relative) => sampler.readArcs(relative),
    Z: sampler => sampler.closePath(),
};

export function parseSvgPathPoints(pathData: string): SvgPathPoint[] {
    return new SvgPathSampler(pathData).parse();
}

class SvgPathSampler {
    private readonly tokens: string[];
    private index = 0;
    private command = '';
    private current: SvgPathPoint = { x: 0, y: 0 };
    private start: SvgPathPoint = { x: 0, y: 0 };
    private lastCubicControl: SvgPathPoint | null = null;
    private lastQuadraticControl: SvgPathPoint | null = null;
    readonly points: SvgPathPoint[] = [];

    constructor(pathData: string) {
        this.tokens = pathData.match(SVG_PATH_TOKEN) ?? [];
    }

    parse(): SvgPathPoint[] {
        while (this.index < this.tokens.length) {
            if (isPathCommand(this.tokens[this.index])) this.command = this.tokens[this.index++] ?? '';
            if (!this.command) break;

            const before = this.index;
            const reader = PATH_COMMAND_READERS[this.command.toUpperCase()];
            if (!reader?.(this, this.command === this.command.toLowerCase())) return this.points;
            if (this.index === before && !isPathCommand(this.tokens[this.index])) return this.points;
        }
        return this.points;
    }

    readMove(relative: boolean): boolean {
        if (!this.hasNumbers(2)) return false;
        this.current = this.absolute(this.read(), this.read(), relative);
        this.start = this.current;
        this.push(this.current);
        this.command = relative ? 'l' : 'L';
        this.clearControls();
        return true;
    }

    readLines(relative: boolean): boolean {
        while (this.hasNumbers(2)) this.lineTo(this.absolute(this.read(), this.read(), relative));
        return true;
    }

    readHorizontalLines(relative: boolean): boolean {
        while (this.hasNumbers(1)) {
            const x = this.read();
            this.lineTo({ x: relative ? this.current.x + x : x, y: this.current.y });
        }
        return true;
    }

    readVerticalLines(relative: boolean): boolean {
        while (this.hasNumbers(1)) {
            const y = this.read();
            this.lineTo({ x: this.current.x, y: relative ? this.current.y + y : y });
        }
        return true;
    }

    readCubics(relative: boolean): boolean {
        return this.readCurve(6, () => {
            this.sampleCubicTo(
                this.readAbsolutePoint(relative),
                this.readAbsolutePoint(relative),
                this.readAbsolutePoint(relative),
            );
        });
    }

    readSmoothCubics(relative: boolean): boolean {
        return this.readCurve(4, () => {
            const c1 = this.lastCubicControl ? reflect(this.current, this.lastCubicControl) : this.current;
            this.sampleCubicTo(c1, this.readAbsolutePoint(relative), this.readAbsolutePoint(relative));
        });
    }

    readQuadratics(relative: boolean): boolean {
        return this.readCurve(4, () => {
            this.sampleQuadraticTo(this.readAbsolutePoint(relative), this.readAbsolutePoint(relative));
        });
    }

    readSmoothQuadratics(relative: boolean): boolean {
        return this.readCurve(2, () => {
            const control = this.lastQuadraticControl ? reflect(this.current, this.lastQuadraticControl) : { ...this.current };
            this.sampleQuadraticTo(control, this.readAbsolutePoint(relative));
        });
    }

    private readCurve(numberCount: number, readSegment: () => void): boolean {
        while (this.hasNumbers(numberCount)) readSegment();
        return true;
    }

    private setCubicControl(control: SvgPathPoint): void {
        this.lastCubicControl = control;
        this.lastQuadraticControl = null;
    }

    private setQuadraticControl(control: SvgPathPoint): void {
        this.lastQuadraticControl = control;
        this.lastCubicControl = null;
    }

    private readAbsolutePoint(relative: boolean): SvgPathPoint {
        return this.absolute(this.read(), this.read(), relative);
    }

    private sampleCubicTo(c1: SvgPathPoint, c2: SvgPathPoint, end: SvgPathPoint): void {
        sampleCubic(this.current, c1, c2, end, point => this.push(point));
        this.current = end;
        this.setCubicControl(c2);
    }

    private sampleQuadraticTo(control: SvgPathPoint, end: SvgPathPoint): void {
        sampleQuadratic(this.current, control, end, point => this.push(point));
        this.current = end;
        this.setQuadraticControl(control);
    }

    readArcs(relative: boolean): boolean {
        while (this.hasNumbers(7)) {
            this.read();
            this.read();
            this.read();
            this.read();
            this.read();
            this.lineTo(this.absolute(this.read(), this.read(), relative));
        }
        return true;
    }

    closePath(): boolean {
        this.lineTo(this.start);
        this.command = '';
        return true;
    }

    private push(point: SvgPathPoint): void {
        const previous = this.points.at(-1);
        if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.001) this.points.push(point);
    }

    private hasNumbers(count: number): boolean {
        return this.index + count <= this.tokens.length
            && this.tokens.slice(this.index, this.index + count).every(token => !isPathCommand(token));
    }

    private read(): number {
        return Number(this.tokens[this.index++]);
    }

    private absolute(x: number, y: number, relative: boolean): SvgPathPoint {
        return relative ? { x: this.current.x + x, y: this.current.y + y } : { x, y };
    }

    private lineTo(point: SvgPathPoint): void {
        this.current = point;
        this.push(this.current);
        this.clearControls();
    }

    private clearControls(): void {
        this.lastCubicControl = null;
        this.lastQuadraticControl = null;
    }
}

function isPathCommand(token: string | undefined): boolean {
    return Boolean(token && /^[A-Za-z]$/.test(token));
}

function reflect(origin: SvgPathPoint, control: SvgPathPoint): SvgPathPoint {
    return {
        x: origin.x * 2 - control.x,
        y: origin.y * 2 - control.y,
    };
}

function sampleCubic(from: SvgPathPoint, c1: SvgPathPoint, c2: SvgPathPoint, to: SvgPathPoint, push: (point: SvgPathPoint) => void): void {
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
        const t = step / CURVE_STEPS;
        const mt = 1 - t;
        push({
            x: mt ** 3 * from.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * to.x,
            y: mt ** 3 * from.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * to.y,
        });
    }
}

function sampleQuadratic(from: SvgPathPoint, c: SvgPathPoint, to: SvgPathPoint, push: (point: SvgPathPoint) => void): void {
    for (let step = 1; step <= CURVE_STEPS; step += 1) {
        const t = step / CURVE_STEPS;
        const mt = 1 - t;
        push({
            x: mt ** 2 * from.x + 2 * mt * t * c.x + t ** 2 * to.x,
            y: mt ** 2 * from.y + 2 * mt * t * c.y + t ** 2 * to.y,
        });
    }
}
