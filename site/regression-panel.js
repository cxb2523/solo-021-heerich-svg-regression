/**
 * Manual regression panel for the docs page.
 *
 * Renders the same fixtures the node:test suite pins
 * (tests/regression-fixtures.js), but live in the browser: pick one of three
 * preset scenes and one of two cameras, and the panel rebuilds the engine
 * from scratch, re-renders the SVG, times a cold frame, and compares every
 * projected face against the hand-derived expected table row by row.
 */

import { Heerich } from "../src/heerich.js";
import {
  CAMERAS,
  CAMERA_IDS,
  EXPECTED,
  SCENES,
  SCENE_IDS,
  TILE,
} from "../tests/regression-fixtures.js";

const root = document.getElementById("regression-panel");
if (root) initRegressionPanel(root);

function initRegressionPanel(root) {
  root.innerHTML = `
    <div class="reg-controls">
      <div class="reg-control-group">
        <span class="reg-control-title">Scene</span>
        <div class="reg-toggle" id="reg-scenes" role="group" aria-label="Scene"></div>
      </div>
      <div class="reg-control-group">
        <span class="reg-control-title">Camera</span>
        <div class="reg-toggle" id="reg-cameras" role="group" aria-label="Camera"></div>
      </div>
      <div class="reg-stats" id="reg-stats" aria-live="polite"></div>
    </div>
    <div class="reg-body">
      <div class="reg-canvas" id="reg-canvas"></div>
      <div class="reg-expected">
        <h4>Frozen expectations <small id="reg-match"></small></h4>
        <div class="reg-table-wrap">
          <table class="reg-table">
            <thead>
              <tr>
                <th>#</th><th>face</th><th>voxel</th><th>expected points (draw order)</th><th></th>
              </tr>
            </thead>
            <tbody id="reg-rows"></tbody>
          </table>
        </div>
        <p class="reg-note">
          Expected coordinates are derived from the projection equations and
          pinned in <code>tests/regression-fixtures.js</code>; the assertions
          live in <code>tests/svg-regression.test.js</code>.
        </p>
      </div>
    </div>`;

  const sceneButtons = new Map();
  const cameraButtons = new Map();
  for (const id of SCENE_IDS) {
    sceneButtons.set(id, addToggle("reg-scenes", id, SCENES[id].label));
  }
  for (const id of CAMERA_IDS) {
    cameraButtons.set(id, addToggle("reg-cameras", id, CAMERAS[id].label));
  }

  let sceneId = SCENE_IDS[0];
  let cameraId = CAMERA_IDS[0];

  function addToggle(containerId, id, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reg-btn";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (containerId === "reg-scenes") sceneId = id;
      else cameraId = id;
      syncButtons();
      run();
    });
    document.getElementById(containerId).appendChild(button);
    return button;
  }

  function syncButtons() {
    for (const [id, button] of sceneButtons) {
      button.classList.toggle("is-active", id === sceneId);
      button.setAttribute("aria-pressed", String(id === sceneId));
    }
    for (const [id, button] of cameraButtons) {
      button.classList.toggle("is-active", id === cameraId);
      button.setAttribute("aria-pressed", String(id === cameraId));
    }
  }

  function describeFace(face) {
    return {
      type: face.type,
      voxel: [face.voxel.x, face.voxel.y, face.voxel.z],
      points: face.points.data.slice(),
    };
  }

  /**
   * Rebuild everything from the fixture definitions. Building a fresh Heerich
   * instance guarantees the measured frame is a cold render rather than a
   * cache hit — every switch genuinely recomputes faces, projection and SVG.
   */
  function run() {
    const h = new Heerich({ tile: TILE, camera: CAMERAS[cameraId] });
    SCENES[sceneId].build(h);

    const t0 = performance.now();
    const svg = h.toSVG();
    const frameMs = performance.now() - t0;

    const canvas = document.getElementById("reg-canvas");
    canvas.innerHTML = svg;

    const faces = h.getFaces().map(describeFace);
    const expected = EXPECTED[cameraId][sceneId];
    const polygonCount = (svg.match(/<polygon\b/g) || []).length;
    const pathCount = (svg.match(/<path\b/g) || []).length;

    document.getElementById("reg-stats").innerHTML = `
      <span><b>${faces.length}</b> faces</span>
      <span><b>${polygonCount}</b> polygons</span>
      <span><b>${pathCount}</b> paths</span>
      <span><b>${frameMs.toFixed(3)}</b> ms / cold frame</span>`;

    const rows = document.getElementById("reg-rows");
    rows.innerHTML = "";
    let matches = 0;
    const total = Math.max(faces.length, expected.length);
    for (let i = 0; i < total; i++) {
      const actual = faces[i];
      const want = expected[i];
      const ok =
        actual &&
        want &&
        actual.type === want.type &&
        sameVoxel(actual.voxel, want.voxel) &&
        samePoints(actual.points, want.points);
      if (ok) matches++;
      const tr = document.createElement("tr");
      tr.className = ok ? "reg-row-ok" : "reg-row-bad";
      tr.innerHTML = `
        <td>${i}</td>
        <td>${want ? want.type : "—"}</td>
        <td>${want ? `[${want.voxel.join(", ")}]` : "—"}</td>
        <td class="reg-points">${want ? formatPoints(want.points) : "—"}</td>
        <td class="reg-status">${ok ? "✓" : "✗ " + describeMismatch(actual, want)}</td>`;
      rows.appendChild(tr);
    }
    const matchEl = document.getElementById("reg-match");
    matchEl.textContent = `${matches}/${expected.length} rows match live render`;
    matchEl.className =
      matches === expected.length && faces.length === expected.length
        ? "reg-all-ok"
        : "reg-mismatch";
  }

  function sameVoxel(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  function samePoints(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  function formatPoints(points) {
    const pairs = [];
    for (let i = 0; i < points.length; i += 2) {
      pairs.push(`(${points[i]}, ${points[i + 1]})`);
    }
    return pairs.join(" ");
  }

  function describeMismatch(actual, want) {
    if (!actual) return "missing face";
    if (!want) return "unexpected face";
    if (actual.type !== want.type) return `type ${actual.type} ≠ ${want.type}`;
    if (!sameVoxel(actual.voxel, want.voxel)) {
      return `voxel [${actual.voxel}] ≠ [${want.voxel}]`;
    }
    return "points differ";
  }

  syncButtons();
  run();
}
