/**
 * Regression tests for the voxel -> SVG renderer.
 *
 * Run: node --test tests/regression/regression.test.js
 * (or simply `npm test`).
 *
 * The tests drive only the documented public API (Heerich + geometry/camera
 * options); no renderer code is reimplemented here. All expected numbers
 * live in ./fixtures.js and are derived there from the projection formulas
 * and face winding, with comments explaining why each face is visible.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { Heerich } from "../../src/heerich.js";
import {
  ANGLE_SWEEP,
  CAMERAS,
  EMPTY_SVG,
  EXPECTED_FACES,
  ISO_EPS,
  SCENARIOS,
  SINGLE_OBLIQUE_SVG,
  VISIBILITY,
  buildClipScene,
  buildEngine,
} from "./fixtures.js";

/** Flatten a face to [voxel xyz, type, projected points] for assertions. */
function signature(face) {
  return {
    voxel: [face.voxel.x, face.voxel.y, face.voxel.z],
    type: face.type,
    points: face.points.data,
  };
}

function faceSignatures(engine) {
  return engine.getFaces().map(signature);
}

function assertPointsClose(actual, expected, eps, label) {
  assert.equal(
    actual.length,
    expected.length,
    `${label}: expected ${expected.length / 2} points, got ${actual.length / 2}`,
  );
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= eps,
      `${label}: coordinate ${i} expected ~${expected[i]}, got ${actual[i]}`,
    );
  }
}

/**
 * Compare a rendered face list against the geometric fixture: draw order,
 * voxel identity, face type and every projected coordinate.
 */
function assertFaceList(engine, expectedFaces, { eps = 0 } = {}) {
  const faces = engine.getFaces();
  assert.equal(
    faces.length,
    expectedFaces.length,
    `face count: expected ${expectedFaces.length}, got ${faces.length}`,
  );

  expectedFaces.forEach((expected, index) => {
    const face = faces[index];
    const label = `face #${index} (${expected.voxel.join(",")} ${expected.type})`;
    assert.deepEqual(
      [face.voxel.x, face.voxel.y, face.voxel.z],
      expected.voxel,
      `${label}: wrong voxel (draw order regression)`,
    );
    assert.equal(face.type, expected.type, `${label}: wrong face type`);
    assertPointsClose(face.points.data, expected.points, eps, label);
  });
}

// ─── Boundary: empty scene ──────────────────────────────────────────────────

test("empty scene: renders zero faces and the contract-derived SVG", () => {
  const h = buildEngine("empty", "oblique");

  assert.equal(h.getFaces().length, 0);
  assert.deepEqual(h.getBounds(20), {
    x: -20,
    y: -20,
    w: 140,
    h: 140,
    faces: [],
  });
  assert.equal(h.toSVG({ padding: 20 }), EMPTY_SVG);
});

// ─── Boundary: single voxel ─────────────────────────────────────────────────

test("single voxel: exact three faces, draw order, coordinates and SVG (oblique 315)", () => {
  const h = buildEngine("single", "oblique");

  // Neighbour checks: no voxel surrounds the cell, so the three camera-facing
  // sides are exposed; the other three are direction-culled before sorting.
  assertFaceList(h, EXPECTED_FACES.single.oblique);
  assert.equal(h.toSVG({ padding: 20 }), SINGLE_OBLIQUE_SVG);
});

test("single voxel: raw faces expose all six sides regardless of camera", () => {
  const h = buildEngine("single", "oblique");
  const raw = h.getFaces({ raw: true });
  assert.equal(raw.length, 6);
  assert.deepEqual(raw.map((f) => f.type).sort(), [
    "back",
    "bottom",
    "front",
    "left",
    "right",
    "top",
  ]);
});

test("solid 2x2x2 cube exposes exactly 24 raw surface faces (6 sides x 4)", () => {
  const h = new Heerich({ tile: 10, camera: CAMERAS.oblique });
  h.addGeometry({ type: "box", position: [0, 0, 0], size: 2 });
  // 8 interior-touching voxels: 6 outer sides of 4 faces each, nothing else.
  assert.equal(h.getFaces({ raw: true }).length, 24);
});

// ─── Per-face projection + draw order ───────────────────────────────────────

test("stair: every face keeps its derived projected quad and draw order (oblique)", () => {
  const h = buildEngine("stair", "oblique");
  assertFaceList(h, EXPECTED_FACES.stair.oblique);

  // The neighbour-touching pair of faces must never be emitted.
  const types = faceSignatures(h).map((f) => `${f.voxel[2]}:${f.type}`);
  assert.ok(
    !types.includes("0:back"),
    "front voxel back face must be occluded",
  );
  assert.ok(
    !types.includes("1:front"),
    "rear voxel front face must be occluded",
  );
});

test("stair: the farther voxel (z=1) is painted before the near one (z=0)", () => {
  const h = buildEngine("stair", "oblique");
  const order = faceSignatures(h).map((f) => f.voxel[2]);
  assert.deepEqual(
    order,
    [1, 1, 0, 0, 0],
    "painter order: all z=1 faces precede the z=0 faces",
  );
});

test("stair: isometric quads match the analytic projection within tolerance", () => {
  const h = buildEngine("stair", "iso");
  assertFaceList(h, EXPECTED_FACES.stair.iso, { eps: ISO_EPS });
});

// ─── Determinism: same camera renders byte-identical output ─────────────────

test("repeated toSVG() calls with the same camera are byte-identical", () => {
  const h = buildEngine("stair", "oblique");
  const first = h.toSVG({ padding: 20 });
  assert.equal(h.toSVG({ padding: 20 }), first);
  assert.equal(h.toSVG({ padding: 20 }), first);
});

test("fresh identical engines and fresh face computations serialize identically", () => {
  const a = buildEngine("stair", "oblique");
  const b = buildEngine("stair", "oblique");
  assert.equal(b.toSVG({ padding: 20 }), a.toSVG({ padding: 20 }));
  // Forcing a cold rebuild must reproduce the same polygons and order.
  a._invalidate();
  assert.deepEqual(faceSignatures(a), faceSignatures(b));
});

test("occlusion-clipped output is byte-identical across renders", () => {
  const h = buildClipScene();
  const first = h.toSVG({ padding: 20, occlusion: true });
  assert.equal(h.toSVG({ padding: 20, occlusion: true }), first);
});

// ─── Camera switching: which faces appear and which are hidden ──────────────

test("oblique 315 vs isometric 45: visible face sets follow the geometry rules", () => {
  const oblique = buildEngine("single", "oblique");
  const iso = buildEngine("single", "iso");

  const obliqueTypes = faceSignatures(oblique)
    .map((f) => f.type)
    .sort();
  const isoTypes = faceSignatures(iso)
    .map((f) => f.type)
    .sort();

  assert.deepEqual(obliqueTypes, [...VISIBILITY.oblique.shown].sort());
  assert.deepEqual(isoTypes, [...VISIBILITY.iso.shown].sort());

  // The only difference between these two cameras is the X-facing side:
  // oblique 315 sees +X (right), iso 45 sees -X (left). top/front are shared.
  assert.ok(obliqueTypes.includes("right"));
  assert.ok(!obliqueTypes.includes("left"));
  assert.ok(isoTypes.includes("left"));
  assert.ok(!isoTypes.includes("right"));

  // The culled sides carry the documented geometric reason (fixture contract).
  for (const hidden of ["bottom", "left", "back"]) {
    assert.equal(typeof VISIBILITY.oblique.hidden[hidden], "string");
  }
  for (const hidden of ["bottom", "right", "back"]) {
    assert.equal(typeof VISIBILITY.iso.hidden[hidden], "string");
  }
});

test("switching one engine between cameras changes the visible set live", () => {
  const h = buildEngine("single", "oblique");
  assert.deepEqual(
    h
      .getFaces()
      .map((f) => f.type)
      .sort(),
    ["front", "right", "top"],
  );

  h.setCamera(CAMERAS.iso);
  assert.deepEqual(
    h
      .getFaces()
      .map((f) => f.type)
      .sort(),
    ["front", "left", "top"],
  );

  h.setCamera(CAMERAS.oblique);
  assert.deepEqual(
    h
      .getFaces()
      .map((f) => f.type)
      .sort(),
    ["front", "right", "top"],
  );
});

test("angle sweep: visible sets for oblique and iso at all four canonical angles", () => {
  for (const cameraId of ["oblique", "iso"]) {
    for (const angle of [45, 135, 225, 315]) {
      const camera =
        cameraId === "oblique"
          ? { type: "oblique", angle, distance: 6 * Math.SQRT2 }
          : { type: "isometric", angle };
      const h = new Heerich({ tile: 10, camera });
      SCENARIOS.single.build(h);
      assert.deepEqual(
        h
          .getFaces()
          .map((f) => f.type)
          .sort(),
        [...ANGLE_SWEEP[cameraId][angle]].sort(),
        `${cameraId} ${angle}deg visible set`,
      );
    }
  }
});

test("iso 45 single voxel: exact projected quads within tolerance", () => {
  const h = buildEngine("single", "iso");
  assertFaceList(h, EXPECTED_FACES.single.iso, { eps: ISO_EPS });
});

// ─── Occlusion path output ──────────────────────────────────────────────────

test("partial overlap emits exactly one clipped <path> and keeps other polygons", () => {
  const h = buildClipScene();
  const svg = h.toSVG({ padding: 20, occlusion: true });
  const paths = svg.match(/<path /g) || [];
  const polygons = svg.match(/<polygon /g) || [];
  assert.equal(
    paths.length,
    1,
    "rear wall front face becomes one clipped path",
  );
  assert.equal(polygons.length, 5, "other five faces remain polygons");

  // The clipped path belongs to the rear voxel and must not cover the small
  // front voxel's footprint: the path is a single compound d attribute.
  assert.match(svg, /data-voxel="0,0,1"[^>]*data-face="front"/);
});

test("without occlusion culling the same scene is all polygons, no paths", () => {
  const h = buildClipScene();
  const svg = h.toSVG({ padding: 20 });
  assert.equal((svg.match(/<path /g) || []).length, 0);
  assert.equal((svg.match(/<polygon /g) || []).length, 6);
});
