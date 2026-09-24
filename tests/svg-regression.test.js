/**
 * SVG geometry regression tests.
 *
 * These tests pin the externally observable geometry of the public pipeline
 * (addGeometry/getFaces/toSVG + setCamera) to values derived by hand from the
 * projection equations. The derivations live next to the numbers in
 * tests/regression-fixtures.js; this file never re-implements any projection,
 * culling or sorting logic — it only reads what the public API produced and
 * compares it against the geometrically derived descriptors.
 *
 * Run: npm test   (or: node --test tests/svg-regression.test.js)
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Heerich } from "../src/heerich.js";
import {
  CAMERAS,
  CAMERA_IDS,
  EXPECTED,
  SCENES,
  SCENE_IDS,
  TILE,
} from "./regression-fixtures.js";

/**
 * Reduce a rendered face to its stable, externally observable shape.
 * No geometry is recomputed here: points come straight from getFaces().
 * @param {import("../src/heerich.js").Face} face
 */
function describeFace(face) {
  return {
    type: face.type,
    voxel: [face.voxel.x, face.voxel.y, face.voxel.z],
    points: face.points.data.slice(),
  };
}

/** Build a fresh engine for one scene/camera combination. */
function renderScene(sceneId, cameraId) {
  const camera = CAMERAS[cameraId];
  const h = new Heerich({ tile: TILE, camera });
  SCENES[sceneId].build(h);
  return h;
}

/** Count emitted elements of a given tag in an SVG string. */
function countTag(svg, tag) {
  return svg.match(new RegExp(`<${tag}\\b`, "g"))?.length ?? 0;
}

const FACE_NAMES = ["top", "bottom", "left", "right", "front", "back"];

describe("empty scene boundary", () => {
  test("getFaces() yields no faces for either camera", () => {
    for (const cameraId of CAMERA_IDS) {
      const h = renderSceneEmpty(cameraId);
      assert.deepEqual(h.getFaces(), [], `${cameraId}: no faces`);
      assert.equal(h.getFaces().length, 0);
    }
  });

  test("toSVG() is the exact derived empty-scene markup", () => {
    // Derivation: with zero faces computeBounds() falls back to a 100x100 box
    // at the origin; the default padding of 20 expands it to viewBox
    // "-20 -20 140 140", and the single translate group is emitted empty.
    const h = renderSceneEmpty("oblique315");
    assert.equal(
      h.toSVG(),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 140 140" style="width:100%; height:100%;"><g transform="translate(0, 0)"></g></svg>`,
    );
    assert.equal(countTag(h.toSVG(), "polygon"), 0);
    assert.equal(countTag(h.toSVG(), "path"), 0);
  });
});

function renderSceneEmpty(cameraId) {
  return new Heerich({ tile: TILE, camera: CAMERAS[cameraId] });
}

describe("single-voxel boundary", () => {
  test("oblique315 pins projected coordinates and draw order", () => {
    const h = renderScene("single", "oblique315");
    const faces = h.getFaces().map(describeFace);
    assert.deepEqual(faces, EXPECTED.oblique315.single);

    // Camera-direction culling at 315 deg (sin<0, cos>0):
    // top/front/right face the viewer; bottom/left/back are hidden.
    const visible = new Set(faces.map((f) => f.type));
    assert.deepEqual([...visible].sort(), ["front", "right", "top"]);
    for (const hidden of ["bottom", "left", "back"]) {
      assert.equal(visible.has(hidden), false, `${hidden} must be culled`);
    }
  });

  test("iso45 pins projected coordinates and draw order", () => {
    const h = renderScene("single", "iso45");
    const faces = h.getFaces().map(describeFace);
    assert.deepEqual(faces, EXPECTED.iso45.single);

    // View vector (sin45*cosP, sinP, cos45*cosP) is (+,+,+): only faces
    // whose outward normal has a negative dot product survive, i.e. the -y
    // (top), -x (left) and -z (front) faces. bottom/right/back are culled.
    const visible = new Set(faces.map((f) => f.type));
    assert.deepEqual([...visible].sort(), ["front", "left", "top"]);
    for (const hidden of ["bottom", "right", "back"]) {
      assert.equal(visible.has(hidden), false, `${hidden} must be culled`);
    }
  });
});

describe("camera switching: isometric vs oblique", () => {
  test("the same voxel's visible set changes exactly as the geometry predicts", () => {
    const h = renderScene("single", "oblique315");
    const obliqueVisible = new Set(h.getFaces().map((f) => f.type));

    h.setCamera(CAMERAS.iso45);
    const isoVisible = new Set(h.getFaces().map((f) => f.type));

    // Shared by both viewpoints: looking down at the -z front corner, the
    // downward top face and the -z front face are visible in both.
    for (const shared of ["top", "front"]) {
      assert.ok(obliqueVisible.has(shared), `oblique must show ${shared}`);
      assert.ok(isoVisible.has(shared), `iso must show ${shared}`);
    }
    // Swapped x-face: the depth axis recedes toward +x under oblique315
    // (right shown), while iso45 rotates the viewer to the +x side so the -x
    // left face shows instead.
    assert.ok(obliqueVisible.has("right"));
    assert.equal(isoVisible.has("right"), false);
    assert.equal(obliqueVisible.has("left"), false);
    assert.ok(isoVisible.has("left"));
    // Neither viewpoint ever shows bottom or back for this isolated voxel.
    for (const set of [obliqueVisible, isoVisible]) {
      assert.equal(set.has("bottom"), false);
      assert.equal(set.has("back"), false);
    }
    assert.deepEqual([...isoVisible].sort(), ["front", "left", "top"]);
    assert.deepEqual([...obliqueVisible].sort(), ["front", "right", "top"]);
  });

  test("switching back restores the original geometry", () => {
    const h = renderScene("single", "oblique315");
    const before = h.getFaces().map(describeFace);
    h.setCamera(CAMERAS.iso45);
    h.getFaces();
    h.setCamera(CAMERAS.oblique315);
    assert.deepEqual(h.getFaces().map(describeFace), before);
  });

  test("all six face names are present in raw faces before camera culling", () => {
    // Raw geometry must expose every neighbour-visible face regardless of the
    // camera; the camera only decides which subset is projected.
    const h = renderScene("single", "iso45");
    const raw = h.getFaces({ raw: true });
    assert.deepEqual(raw.map((f) => f.type).sort(), [...FACE_NAMES].sort());
  });
});

describe("multi-voxel geometry: neighbour culling and draw order", () => {
  for (const cameraId of CAMERA_IDS) {
    for (const sceneId of SCENE_IDS) {
      test(`${cameraId}/${sceneId} matches the full derived descriptor table`, () => {
        const h = renderScene(sceneId, cameraId);
        const faces = h.getFaces().map(describeFace);
        assert.deepEqual(faces, EXPECTED[cameraId][sceneId]);

        // Every descriptor is a closed quad with engine-truncated coordinates.
        for (const face of faces) {
          assert.equal(face.points.length, 8);
          for (const value of face.points) {
            assert.equal(typeof value, "number");
            assert.ok(Number.isFinite(value));
          }
        }
      });
    }
  }

  test("depth row culls the shared z-seam under oblique315", () => {
    const h = renderScene("row", "oblique315");
    const faces = h.getFaces();
    // No front face on the back voxel and no back face on the front voxel:
    // the two voxels touch, so neither seam is neighbour-exposed.
    assert.equal(
      faces.some((f) => f.type === "front" && f.voxel.z === 1),
      false,
    );
    assert.equal(
      faces.some((f) => f.type === "back" && f.voxel.z === 0),
      false,
    );
    // Back voxel paints completely before the front voxel.
    const backVoxelIndex = faces.findIndex((f) => f.voxel.z === 1);
    const lastBackFace = Math.max(
      ...faces.map((f, i) => (f.voxel.z === 1 ? i : -1)),
    );
    assert.ok(backVoxelIndex === 0);
    assert.ok(lastBackFace < faces.length - 3);
  });

  test("L corner culls both seams and keeps the derived 7-face order", () => {
    const h = renderScene("l", "oblique315");
    const faces = h.getFaces();
    assert.equal(faces.length, 7);
    // A=(0,0,0) loses right (seam with B) and back (seam with C);
    // B loses left (seam with A); C loses front (seam with A).
    const key = (type, x, z) =>
      faces.some((f) => f.type === type && f.voxel.x === x && f.voxel.z === z);
    assert.equal(key("right", 0, 0), false); // A's right, hidden by B
    assert.equal(key("back", 0, 0), false); // A's back, hidden by C
    assert.equal(key("left", 1, 0), false); // B's left, hidden by A
    assert.equal(key("front", 0, 1), false); // C's front, hidden by A
  });
});

describe("deterministic, byte-identical rendering", () => {
  for (const cameraId of CAMERA_IDS) {
    for (const sceneId of SCENE_IDS) {
      test(`${cameraId}/${sceneId} repeats byte-for-byte`, () => {
        const h = renderScene(sceneId, cameraId);
        const first = h.toSVG();
        // Warm cache path.
        assert.equal(h.toSVG(), first);
        assert.equal(h.toSVG(), first);
        // A second, independently built instance (same construction order)
        // must serialise to the very same bytes.
        const h2 = renderScene(sceneId, cameraId);
        assert.equal(h2.toSVG(), first);
      });
    }
  }

  test("a camera round-trip restores the byte-identical SVG", () => {
    const h = renderScene("l", "oblique315");
    const first = h.toSVG();
    h.setCamera(CAMERAS.iso45);
    h.toSVG();
    h.setCamera(CAMERAS.oblique315);
    assert.equal(h.toSVG(), first);
  });

  test("SVG emits exactly one polygon per projected face and no paths", () => {
    // None of these scenes use occlusion clipping/hatching, so each face is a
    // <polygon>; a change that silently switched faces to clipped <path>s
    // would fail this count.
    for (const cameraId of CAMERA_IDS) {
      for (const sceneId of SCENE_IDS) {
        const h = renderScene(sceneId, cameraId);
        const svg = h.toSVG();
        const expected = EXPECTED[cameraId][sceneId].length;
        assert.equal(
          countTag(svg, "polygon"),
          expected,
          `${cameraId}/${sceneId} polygon count`,
        );
        assert.equal(
          countTag(svg, "path"),
          0,
          `${cameraId}/${sceneId} path count`,
        );
      }
    }
  });
});
