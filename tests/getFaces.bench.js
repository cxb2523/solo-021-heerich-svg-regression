// Benchmark getFaces() across projections and scene sizes.
// Run directly: node tests/getFaces.bench.js
// Or import { run } to collect structured results.

import { Heerich } from "../src/heerich.js";

const SIZES = [10, 25, 40];
const PROJECTIONS = ["oblique", "perspective", "orthographic"];
const WARMUP = 5;
const ITERS = 30;

function buildScene(size) {
  const h = new Heerich();
  h.batch(() => {
    h.applyGeometry({
      type: "box",
      position: [0, 0, 0],
      size: [size, size, size],
    });
  });
  return h;
}

function bench(fn) {
  for (let i = 0; i < WARMUP; i++) fn();
  const samples = [];
  for (let i = 0; i < ITERS; i++) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return {
    median: samples[Math.floor(samples.length / 2)],
    min: samples[0],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
  };
}

export function run() {
  const rows = [];
  for (const size of SIZES) {
    for (const projection of PROJECTIONS) {
      const h = buildScene(size);
      h.renderOptions.projection = projection;
      const cold = bench(() => {
        h._invalidate();
        h.getFaces();
      });
      const warm = bench(() => h.getFaces());
      rows.push({
        size,
        voxels: size ** 3,
        projection,
        cold: cold.median,
        warm: warm.median,
      });
    }
  }
  return { name: "getFaces", rows, meta: { warmup: WARMUP, iters: ITERS } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, meta } = run();
  console.log(`node ${process.version}   warmup=${meta.warmup} iters=${meta.iters}\n`);
  for (const r of rows) {
    console.log(
      `  ${r.size}³ ${r.projection.padEnd(13)} cold=${r.cold.toFixed(2).padStart(7)} ms  warm=${r.warm.toFixed(2).padStart(7)} ms`,
    );
  }
}
