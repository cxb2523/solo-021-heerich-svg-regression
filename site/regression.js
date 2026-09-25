/**
 * Regression check panel.
 *
 * Mirrors tests/regression/regression.test.js in the browser: the same
 * scenarios, cameras and geometry-derived expectations. Every toggle builds a
 * FRESH engine, recomputes faces/SVG and measures the frame, so the numbers
 * cannot go stale.
 */

import { Heerich } from "../src/heerich.js";
import {
  CAMERAS,
  EXPECTED_FACES,
  ISO_EPS,
  SCENARIOS,
  buildEngine,
} from "../tests/regression/fixtures.js";

const state = { scene: "empty", camera: "oblique", recomputes: 0 };

const els = {
  canvas: document.getElementById("reg-canvas"),
  rows: document.getElementById("reg-rows"),
  note: document.getElementById("reg-note"),
  faces: document.getElementById("reg-faces"),
  polygons: document.getElementById("reg-polygons"),
  paths: document.getElementById("reg-paths"),
  time: document.getElementById("reg-time"),
};

function fmtPoints(points) {
  const parts = [];
  for (let i = 0; i < points.length; i += 2) {
    parts.push(`${points[i]},${points[i + 1]}`);
  }
  return parts.join(" ");
}

function pointsMatch(actual, expected) {
  const eps = state.camera === "iso" ? ISO_EPS : 0;
  if (actual.length !== expected.length) return false;
  return expected.every((v, i) => Math.abs(actual[i] - v) <= eps);
}

function rerun() {
  // Fresh engine every time — no cached faces can sneak through.
  const engine = buildEngine(state.scene, state.camera);
  const expected = EXPECTED_FACES[state.scene][state.camera] || [];

  const t0 = performance.now();
  const faces = engine.getFaces();
  const svg = engine.toSVG({ padding: 20 });
  const frameMs = performance.now() - t0;
  state.recomputes++;

  els.canvas.innerHTML = svg;
  els.faces.textContent = faces.length;
  els.polygons.textContent = (svg.match(/<polygon /g) || []).length;
  els.paths.textContent = (svg.match(/<path /g) || []).length;
  els.time.textContent = frameMs.toFixed(2);

  els.rows.innerHTML = "";
  let mismatches = 0;
  faces.forEach((face, index) => {
    const exp = expected[index];
    const actual = face.points.data;
    const ok =
      exp &&
      exp.type === face.type &&
      exp.voxel[0] === face.voxel.x &&
      exp.voxel[1] === face.voxel.y &&
      exp.voxel[2] === face.voxel.z &&
      pointsMatch(actual, exp.points);
    if (!ok) mismatches++;

    const tr = document.createElement("tr");
    tr.className = ok ? "reg-row-ok" : "reg-row-bad";
    tr.innerHTML =
      `<td>${index}</td>` +
      `<td>${face.voxel.x},${face.voxel.y},${face.voxel.z} <code>${face.type}</code></td>` +
      `<td class="reg-points">${fmtPoints(actual)}</td>` +
      `<td class="reg-points">${exp ? fmtPoints(exp.points) : "—"}</td>` +
      `<td>${ok ? "✓" : "✗"}</td>`;
    els.rows.appendChild(tr);
  });

  // Rows the geometry predicts but the renderer did not emit (also a failure).
  if (expected.length > faces.length) {
    for (let i = faces.length; i < expected.length; i++) {
      const exp = expected[i];
      mismatches++;
      const tr = document.createElement("tr");
      tr.className = "reg-row-bad";
      tr.innerHTML =
        `<td>${i}</td>` +
        `<td>${exp.voxel.join(",")} <code>${exp.type}</code></td>` +
        `<td class="reg-points">missing</td>` +
        `<td class="reg-points">${fmtPoints(exp.points)}</td>` +
        `<td>✗</td>`;
      els.rows.appendChild(tr);
    }
  }

  const scenario = SCENARIOS[state.scene];
  const camera = CAMERAS[state.camera];
  els.note.textContent =
    `${scenario.label} · ${camera.type} ${camera.angle}°` +
    (scenario.description ? ` — ${scenario.description}` : "") +
    ` · recompute #${state.recomputes}` +
    (mismatches === 0
      ? " · all faces match the derived expectations."
      : ` · ${mismatches} face(s) differ from expectations.`);
  els.note.classList.toggle("regression-note-bad", mismatches > 0);
}

function wireToggle(containerId, dataKey, stateKey) {
  const container = document.getElementById(containerId);
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    container.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("is-active", b === button);
    });
    state[stateKey] = button.dataset[dataKey];
    rerun();
  });
}

wireToggle("reg-scene", "scene", "scene");
wireToggle("reg-camera", "camera", "camera");
rerun();
