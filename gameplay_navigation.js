// The extracted polygon graph stays authoritative; no raster grid approximation.
export class GameplayNavigation {
    constructor(data, cellSize = 4) {
        this.vertices = data.vertices;
        this.polygons = data.polygons;
        this.cellSize = cellSize;
        this.cells = new Map();
        this.compiled = [];
        this.reverse = Array.from({length: this.polygons.length}, () => []);
        for (let index = 0; index < this.polygons.length; index++) {
            const polygon = this.polygons[index];
            const points = polygon.v.map(v => this.vertices[v]);
            const edges = [];
            let minEdge = Infinity;
            for (let i = 0; i < points.length; i++) {
                const previous = points[(i + points.length - 1) % points.length];
                const current = points[i];
                const dx = current[0] - previous[0], dz = current[2] - previous[2];
                const lengthSquared = dx * dx + dz * dz;
                minEdge = Math.min(minEdge, Math.sqrt(lengthSquared));
                edges.push(previous[0], previous[2], current[0], current[2], dx, dz, lengthSquared);
            }
            const triangles = [];
            const first = points[0];
            for (let i = 1; i < points.length - 1; i++) {
                const second = points[i], third = points[i + 1];
                const ax = second[2] - third[2], az = third[0] - second[0];
                const bx = third[2] - first[2], bz = first[0] - third[0];
                const denominator = ax * (first[0] - third[0]) + az * (first[2] - third[2]);
                if (Math.abs(denominator) < 0.000001) continue;
                triangles.push(ax, az, bx, bz, denominator, third[0], third[2],
                    first[1], second[1], third[1]);
            }
            const flat = points.every(p => p[1] === first[1]) && polygon.c[1] === first[1];
            this.compiled.push({edges: new Float64Array(edges), triangles: new Float64Array(triangles), flat});
            // Expand bounds to cover the legacy edge/projection tolerances.
            const padding = minEdge > 0 ? 0.0002 / minEdge : Infinity;
            if (!Number.isFinite(padding)) throw new Error('Navigation polygon has a zero-length XZ edge');
            const minX = Math.floor((Math.min(...points.map(p => p[0])) - padding) / cellSize);
            const maxX = Math.floor((Math.max(...points.map(p => p[0])) + padding) / cellSize);
            const minZ = Math.floor((Math.min(...points.map(p => p[2])) - padding) / cellSize);
            const maxZ = Math.floor((Math.max(...points.map(p => p[2])) + padding) / cellSize);
            for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
                const key = x + '/' + z;
                let cell = this.cells.get(key);
                if (!cell) this.cells.set(key, cell = []);
                cell.push(index); // Ascending original polygon order, including overlapping floors.
            }
            for (const edge of polygon.n) {
                const destination = this.polygons[edge[0]].c;
                this.reverse[edge[0]].push([index,
                    Math.hypot(polygon.c[0] - destination[0], polygon.c[2] - destination[2])]);
            }
        }
        const count = this.polygons.length;
        this.distances = new Float64Array(count);
        this.next = new Int32Array(count);
        this.heap = new Int32Array(count);
        this.heapPositions = new Int32Array(count);
        this.distances.fill(Infinity);
        this.next.fill(-1);
        this.goal = -1;
        this.builds = 0;
        this.heapSize = 0;
    }
    contains(index, x, z) {
        const e = this.compiled[index].edges;
        let inside = false;
        for (let i = 0; i < e.length; i += 7) {
            const cross = (x - e[i]) * e[i+5] - (z - e[i+1]) * e[i+4];
            const projection = (x - e[i]) * e[i+4] + (z - e[i+1]) * e[i+5];
            if (Math.abs(cross) < 0.0001 && projection >= -0.0001 &&
                projection <= e[i+6] + 0.0001) return true;
            if ((e[i+3] > z) !== (e[i+1] > z) &&
                x < (e[i] - e[i+2]) * (z - e[i+3]) / (e[i+1] - e[i+3]) + e[i+2]) inside = !inside;
        }
        return inside;
    }
    height(index, x, z, exact = false) {
        const compiled = this.compiled[index];
        if (compiled.flat && !exact) return this.polygons[index].c[1];
        const t = compiled.triangles;
        for (let i = 0; i < t.length; i += 10) {
            const dx = x - t[i+5], dz = z - t[i+6];
            const a = (t[i] * dx + t[i+1] * dz) / t[i+4];
            const b = (t[i+2] * dx + t[i+3] * dz) / t[i+4];
            const c = 1 - a - b;
            if (a >= -0.001 && b >= -0.001 && c >= -0.001) return a*t[i+7] + b*t[i+8] + c*t[i+9];
        }
        return this.polygons[index].c[1];
    }
    locate(x, z, preferred = -1, y = 0) {
        if (preferred >= 0 && preferred < this.polygons.length) {
            if (this.contains(preferred, x, z)) return preferred;
            for (const edge of this.polygons[preferred].n) if (this.contains(edge[0], x, z)) return edge[0];
        }
        const candidates = this.cells.get(Math.floor(x / this.cellSize) + '/' + Math.floor(z / this.cellSize));
        if (!candidates) return -1;
        let best = -1, delta = Infinity;
        for (const index of candidates) {
            if (index === preferred || !this.contains(index, x, z)) continue;
            // Preserve legacy tie-breaking between overlapping, almost-flat floors.
            const heightDelta = Math.abs(this.height(index, x, z, true) - y);
            if (heightDelta < delta) {best = index; delta = heightDelta;}
        }
        return best;
    }
    _up(node) {
        let index = this.heapPositions[node];
        if (index < 0) index = this.heapSize++;
        while (index > 0) {
            const parent = (index - 1) >> 1, other = this.heap[parent];
            if (this.distances[other] <= this.distances[node]) break;
            this.heap[index] = other; this.heapPositions[other] = index;
            index = parent;
        }
        this.heap[index] = node; this.heapPositions[node] = index;
    }
    _pop() {
        const result = this.heap[0], node = this.heap[--this.heapSize];
        this.heapPositions[result] = -2;
        if (!this.heapSize) return result;
        let index = 0;
        while (index * 2 + 1 < this.heapSize) {
            let child = index * 2 + 1;
            if (child + 1 < this.heapSize && this.distances[this.heap[child+1]] < this.distances[this.heap[child]]) child++;
            const other = this.heap[child];
            if (this.distances[node] <= this.distances[other]) break;
            this.heap[index] = other; this.heapPositions[other] = index; index = child;
        }
        this.heap[index] = node; this.heapPositions[node] = index;
        return result;
    }
    setGoal(goal) {
        if (goal === this.goal) return false;
        this.goal = goal;
        this.builds++;
        this.distances.fill(Infinity);
        this.next.fill(-1);
        this.heapPositions.fill(-1);
        this.heapSize = 0;
        if (goal < 0 || goal >= this.polygons.length) return true;
        this.distances[goal] = 0;
        this.next[goal] = goal;
        this._up(goal);
        while (this.heapSize) {
            const current = this._pop();
            for (const edge of this.reverse[current]) {
                const node = edge[0];
                if (this.heapPositions[node] === -2) continue;
                const distance = this.distances[current] + edge[1];
                if (distance >= this.distances[node]) continue;
                this.distances[node] = distance;
                this.next[node] = current;
                this._up(node);
            }
        }
        return true;
    }
}
