/**
 * Regression fixtures for the voxel to SVG pipeline.
 *
 * Every expected value in this file is derived from geometry, not captured
 * from a renderer run. The derivations are written out in comments so a wrong
 * polygon can be traced back to the face, voxel and projection step that
 * produced it. If a face coordinate or draw order changes on purpose, update
 * the derivation here first; never paste renderer output.
 *
 * Coordinate system (see README "Coordinate System"):
 *   X right, Y DOWN, Z toward the back (larger Z = farther from viewer).
 *
 * Two cameras are frozen for the regression suite, both with tile = 10:
 *
 * 1. oblique, angle 315, distance 6*sqrt(2):
 *      depthOffsetX = cos(315)*distance = +6
 *      depthOffsetY = sin(315)*distance = -6
 *    One voxel of depth (+Z) shifts the projection exactly (+6, -6). The
 *    sqrt(2) cancels cos/sin(45) = 1/sqrt(2), so every projected vertex is an
 *    integer pixel coordinate; oblique expectations are therefore byte-exact.
 *
 * 2. isometric, angle 45, pitch locked to 35.264:
 *      screenX = ((x-z)*s + 5)*10
 *      screenY = (y*cp - (x+z)*s*sp + 5)*10
 *      s  = sin(45) = 1/sqrt(2) ~ 0.70710678
 *      sp = sin(35.264)          ~ 0.57734451
 *      cp = cos(35.264)          ~ 0.81649658
 *    The engine uses the documented 35.264 literal (not asin(1/sqrt(3)));
 *    the difference is below 1e-4 px and handled with ISO_EPS.
 *
 * Face winding (from _buildFaces3D), cell [x,x+1]x[y,y+1]x[z,z+1]:
 *   top    n=(0,-1,0) (x,y,z) (x+1,y,z) (x+1,y,z+1) (x,y,z+1)
 *   bottom n=(0,+1,0) (x,y+1,z+1) (x+1,y+1,z+1) (x+1,y+1,z) (x,y+1,z)
 *   left   n=(-1,0,0) (x,y,z+1) (x,y,z) (x,y+1,z) (x,y+1,z+1)
 *   right  n=(+1,0,0) (x+1,y,z) (x+1,y,z+1) (x+1,y+1,z+1) (x+1,y+1,z)
 *   front  n=(0,0,-1) (x,y,z) (x,y+1,z) (x+1,y+1,z) (x+1,y,z)
 *   back   n=(0,0,+1) (x+1,y,z+1) (x+1,y+1,z+1) (x,y+1,z+1) (x,y,z+1)
 */

import { Heerich } from "../../src/heerich.js";

export const TILE = 10;

/** Pixel tolerance for isometric coordinates (4-decimal truncation). */
export const ISO_EPS = 2e-4;

/** distance = 6*sqrt(2) makes the per-voxel Z shift exactly (6, -6). */
export const OBLIQUE_DISTANCE = 6 * Math.SQRT2;

export const CAMERAS = {
  /** Depth recedes up-right; viewer is above, on the -X/-Z side. */
  oblique: {
    id: "oblique",
    type: "oblique",
    angle: 315,
    distance: OBLIQUE_DISTANCE,
  },
  /** Standard isometric pan; viewer is in the -X/-Z octant. */
  iso: { id: "iso", type: "isometric", angle: 45 },
};

/**
 * Preset scenarios. `build` populates a fresh engine only through the public
 * geometry API; the tests never touch renderer internals.
 */
export const SCENARIOS = {
  empty: { id: "empty", label: "Empty scene", build: () => {} },
  single: {
    id: "single",
    label: "Single voxel at (0,0,0)",
    build: (h) => {
      h.addGeometry({ type: "box", position: [0, 0, 0], size: 1 });
    },
  },
  stair: {
    id: "stair",
    label: "Two voxels stepped along Z",
    description:
      "A at (0,0,0), B at (0,0,1): one step of depth. The touching faces " +
      "(A.back, B.front) are neighbour-occluded and must never appear; B is " +
      "strictly behind A and must be drawn first.",
    build: (h) => {
      h.addGeometry({ type: "box", position: [0, 0, 0], size: 1 });
      h.addGeometry({ type: "box", position: [0, 0, 1], size: 1 });
    },
  },
};

/**
 * Visibility rationale per frozen camera, stated with normals and the
 * viewing direction only.
 *
 * Oblique direction cull (cullTypes derived from offset signs): back is never
 * drawn (Z points away); depthOffsetY < 0 => +Z climbs the screen => viewer is
 * above => top shown, bottom hidden; depthOffsetX > 0 => +Z drifts right =>
 * viewer at -X => right shown, left hidden; front is always shown.
 *
 * Iso backface test: a face is shown iff viewVec.n < 0. At angle 45 the view
 * vector is (s*cp, sp, s*cp) ~ (0.577, 0.577, 0.577), one positive component
 * per axis, so only the negative-octant normals survive: top, left, front.
 */
export const VISIBILITY = {
  oblique: {
    shown: ["top", "right", "front"],
    hidden: {
      bottom:
        "depthOffsetY = -6 < 0: viewer looks down from -Y (Y points down).",
      left: "depthOffsetX = +6 > 0: viewer stands at -X, the +X (right) face faces them.",
      back: "Z recedes away from an oblique viewer; the +Z face is never seen.",
    },
  },
  iso: {
    shown: ["top", "left", "front"],
    hidden: {
      bottom: "viewVec.n = +sp > 0: the +Y normal points away from the viewer.",
      right: "viewVec.n = +s*cp > 0: the +X normal points away.",
      back: "viewVec.n = +s*cp > 0: the +Z normal points away.",
    },
  },
};

/**
 * Visible sets across the angle sweep, from the same two rules:
 *
 *   oblique offsets (cos a, sin a):
 *      45 (+,+) => bottom + right + front
 *     135 (-,+) => bottom + left  + front
 *     225 (-,-) => top    + left  + front
 *     315 (+,-) => top    + right + front
 *
 *   iso view vector (sin a*cp, sp, cos a*cp): the Y component is sp > 0 for
 *   any pitch in (0,90), so TOP IS VISIBLE AT EVERY ISO ANGLE; X/Z flip with a
 *   and select the other two faces:
 *      45 (+,+,+) => top,left,front     135 (+,+,-) => top,left,back
 *     225 (+,-,-) => top,right,back     315 (+,-,+) => top,right,front
 */
export const ANGLE_SWEEP = {
  oblique: {
    45: ["bottom", "right", "front"],
    135: ["bottom", "left", "front"],
    225: ["top", "left", "front"],
    315: ["top", "right", "front"],
  },
  iso: {
    45: ["top", "left", "front"],
    135: ["top", "left", "back"],
    225: ["top", "right", "back"],
    315: ["top", "right", "front"],
  },
};
// ───────────────────────── Oblique 315 expectations ─────────────────────────
//
// Projection: screen = (x*10 + z*6, y*10 - z*6).
// Painter depth: d = cz - cx*0.6 + cy*0.6 on the face centre c.
// Faces sort back-to-front (largest d first); ties break on
// (voxel.x, voxel.y, voxel.z, type lexicographic).

/**
 * Single voxel (0,0,0), oblique 315.
 *
 *   right, centre c=(1,0.5,0.5): d = 0.5 - 0.6 + 0.3 = 0.2
 *     (1,0,0)->(10,0)  (1,0,1)->(16,-6)  (1,1,1)->(16,4)  (1,1,0)->(10,10)
 *   top, c=(0.5,0,0.5): d = 0.5 - 0.6*0.5 + 0 = 0.2
 *     (0,0,0)->(0,0)  (1,0,0)->(10,0)  (1,0,1)->(16,-6)  (0,0,1)->(6,-6)
 *   Both depths are exactly 0.2; the lexicographic tie-break puts "right"
 *   before "top".
 *   front, c=(0.5,0.5,0): d = 0, frontmost, drawn last
 *     (0,0,0)->(0,0)  (0,1,0)->(0,10)  (1,1,0)->(10,10)  (1,0,0)->(10,0)
 */
export const SINGLE_OBLIQUE = [
  {
    voxel: [0, 0, 0],
    type: "right",
    depth: 0.2,
    points: [10, 0, 16, -6, 16, 4, 10, 10],
  },
  {
    voxel: [0, 0, 0],
    type: "top",
    depth: 0.2,
    points: [0, 0, 10, 0, 16, -6, 6, -6],
  },
  {
    voxel: [0, 0, 0],
    type: "front",
    depth: 0,
    points: [0, 0, 0, 10, 10, 10, 10, 0],
  },
];

/**
 * Stair (A z=0, B z=1), oblique 315. Neighbour checks remove A.back and
 * B.front; five faces remain.
 *
 *   B c~(0.5,0.5,1.5): right/top d = 1.5 - 0.3 = 1.2 (drawn first; tie puts
 *   "right" before "top")
 *     B right (1,0,1)->(16,-6) (1,0,2)->(22,-12) (1,1,2)->(22,-2) (1,1,1)->(16,4)
 *     B top   (0,0,1)->(6,-6)  (1,0,1)->(16,-6) (1,0,2)->(22,-12) (0,0,2)->(12,-12)
 *   A right/top d = 0.2 (same tie rule); A front d = 0 drawn last.
 */
export const STAIR_OBLIQUE = [
  {
    voxel: [0, 0, 1],
    type: "right",
    depth: 1.2,
    points: [16, -6, 22, -12, 22, -2, 16, 4],
  },
  {
    voxel: [0, 0, 1],
    type: "top",
    depth: 1.2,
    points: [6, -6, 16, -6, 22, -12, 12, -12],
  },
  {
    voxel: [0, 0, 0],
    type: "right",
    depth: 0.2,
    points: [10, 0, 16, -6, 16, 4, 10, 10],
  },
  {
    voxel: [0, 0, 0],
    type: "top",
    depth: 0.2,
    points: [0, 0, 10, 0, 16, -6, 6, -6],
  },
  {
    voxel: [0, 0, 0],
    type: "front",
    depth: 0,
    points: [0, 0, 0, 10, 10, 10, 10, 0],
  },
];

// ───────────────────────── Isometric 45 expectations ────────────────────────
//
// All three visible faces of an axis-aligned cube share one analytical depth
// constant (the view-vector dot product with each face centre is identical
// for the three visible directions). The comparator then orders by the
// floating-point evaluation of the projection products and the lexicographic
// tie-break. IEEE-754 evaluation is deterministic, so the sequence is frozen;
// it catches any change to the comparator or projection products. Values
// below come from the closed form at the head of this file, rounded to 4
// decimals like the engine's truncation, and are compared within ISO_EPS.

/** Single voxel (0,0,0), iso 45. Order: top, left, front. */
export const SINGLE_ISO = [
  {
    voxel: [0, 0, 0],
    type: "top",
    points: [50, 50, 57.0711, 45.9176, 50, 41.8351, 42.9289, 45.9176],
  },
  {
    voxel: [0, 0, 0],
    type: "left",
    points: [42.9289, 45.9176, 50, 50, 50, 58.165, 42.9289, 54.0826],
  },
  {
    voxel: [0, 0, 0],
    type: "front",
    points: [50, 50, 50, 58.165, 57.0711, 54.0826, 57.0711, 45.9176],
  },
];

/**
 * Stair, iso 45. B (z=1) is farther: its depth constant is twice A's, so both
 * B faces come first (same float/tie-break order: top, left), then A's three
 * faces (top, left, front).
 */
export const STAIR_ISO = [
  {
    voxel: [0, 0, 1],
    type: "top",
    points: [42.9289, 45.9176, 50, 41.8351, 42.9289, 37.7527, 35.8579, 41.8351],
  },
  {
    voxel: [0, 0, 1],
    type: "left",
    points: [
      35.8579, 41.8351, 42.9289, 45.9176, 42.9289, 54.0826, 35.8579, 50.0001,
    ],
  },
  {
    voxel: [0, 0, 0],
    type: "top",
    points: [50, 50, 57.0711, 45.9176, 50, 41.8351, 42.9289, 45.9176],
  },
  {
    voxel: [0, 0, 0],
    type: "left",
    points: [42.9289, 45.9176, 50, 50, 50, 58.165, 42.9289, 54.0826],
  },
  {
    voxel: [0, 0, 0],
    type: "front",
    points: [50, 50, 50, 58.165, 57.0711, 54.0826, 57.0711, 45.9176],
  },
];

/** Expected draw order per (scenario, camera), as (voxel, type) pairs. */
export const EXPECTED_FACES = {
  single: { oblique: SINGLE_OBLIQUE, iso: SINGLE_ISO },
  stair: { oblique: STAIR_OBLIQUE, iso: STAIR_ISO },
  empty: { oblique: [], iso: [] },
};

/**
 * Full golden SVG of the single voxel under oblique 315. Every byte follows
 * from the renderer contract:
 *   - geometry bounds: x in [0,16], y in [-6,10]; with padding 20 the
 *     viewBox is [0-20, -6-20, 16+40, 16+40] = [-20,-26,56,56];
 *   - three <polygon> elements in the draw order above with the derived
 *     point lists;
 *   - the default style { fill:#aaaaaa, stroke:#000000, strokeWidth:1 } plus
 *     the renderer-injected stroke-linejoin="round", serialized in the
 *     renderer's fixed key order;
 *   - fixed data-voxel/data-face attributes.
 */
export const SINGLE_OBLIQUE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -26 56 56" style="width:100%; height:100%;"><g transform="translate(0, 0)">' +
  '<polygon points="10,0 16,-6 16,4 10,10" stroke-linejoin="round" fill="#aaaaaa" stroke="#000000" stroke-width="1" data-voxel="0,0,0" data-x="0" data-y="0" data-z="0" data-face="right" />' +
  '<polygon points="0,0 10,0 16,-6 6,-6" stroke-linejoin="round" fill="#aaaaaa" stroke="#000000" stroke-width="1" data-voxel="0,0,0" data-x="0" data-y="0" data-z="0" data-face="top" />' +
  '<polygon points="0,0 0,10 10,10 10,0" stroke-linejoin="round" fill="#aaaaaa" stroke="#000000" stroke-width="1" data-voxel="0,0,0" data-x="0" data-y="0" data-z="0" data-face="front" />' +
  "</g></svg>";

/**
 * Empty scene golden SVG. With no faces computeBounds returns its documented
 * fallback {0,0,100,100}; padding 20 gives viewBox [-20,-20,140,140] and the
 * face group is empty. Fixed entirely by the renderer contract.
 */
export const EMPTY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 140 140" style="width:100%; height:100%;"><g transform="translate(0, 0)"></g></svg>';

/**
 * Occlusion scenario: a full voxel wall at z=1 with a half-size (scale 0.5
 * about its centre, hence non-opaque) voxel at z=0. The small front voxel
 * covers the middle quarter of the wall's front face, so occlusion culling
 * must keep the back/top/right wall faces as polygons and emit EXACTLY ONE
 * <path> for the surviving frame of the wall's front face; the scaled
 * voxel's own 3 faces stay polygons. 6 faces total, 1 path, 5 polygons.
 */
export function buildClipScene() {
  const h = new Heerich({ tile: TILE, camera: CAMERAS.oblique });
  h.addGeometry({ type: "box", position: [0, 0, 1], size: 1 });
  h.addGeometry({
    type: "box",
    position: [0, 0, 0],
    size: 1,
    scale: [0.5, 0.5, 0.5],
    scaleOrigin: [0.5, 0.5, 0.5],
  });
  return h;
}

/** Construct an engine for one of the preset scenarios with a frozen camera. */
export function buildEngine(scenarioId, cameraId) {
  const h = new Heerich({ tile: TILE, camera: CAMERAS[cameraId] });
  SCENARIOS[scenarioId].build(h);
  return h;
}
