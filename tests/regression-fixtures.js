/**
 * Regression fixtures shared by:
 *   - tests/svg-regression.test.js  (node:test assertions)
 *   - site/regression-panel.js      (manual comparison panel on the docs page)
 *
 * Every expected value below is derived from the projection geometry by hand
 * (see the derivation notes in each block); none of it was produced by running
 * the renderer and copying its output. The renderer is only ever asked to
 * reproduce the numbers derived here.
 *
 * Shared camera/scene parameters:
 *   - tile = 10 px on every axis
 *   - "oblique315": oblique, angle 315 deg, distance 10
 *   - "iso45": isometric, angle 45 deg (pitch locked to 35.264 deg)
 *
 * A "face descriptor" is the stable, externally observable shape of a rendered
 * face: { type, voxel: [x,y,z], points: [x0,y0, x1,y1, x2,y2, x3,y3] }
 * in the exact back-to-front order getFaces() returns.
 */

/**
 * @typedef {Object} Scene
 * @property {string} id
 * @property {string} label
 * @property {(h: import('../src/heerich.js').Heerich) => void} build
 */

/**
 * @typedef {Object} FaceDescriptor
 * @property {string} type
 * @property {[number, number, number]} voxel
 * @property {number[]} points
 */

export const TILE = 10;
export const OBLIQUE_DISTANCE = 10;

export const CAMERAS = {
  /**
   * Oblique 315 deg: the depth (Z) axis recedes up-right on screen.
   * depthOffset = (cos315, sin315) * distance = (5*sqrt2, -5*sqrt2)
   *             = (7.0711, -7.0711) after the engine's 4-decimal truncation.
   */
  oblique315: {
    label: "oblique 315 (cabinet)",
    type: "oblique",
    angle: 315,
    distance: OBLIQUE_DISTANCE,
  },
  /**
   * Isometric 45 deg: orthographic with horizontal pan 45 deg and pitch
   * locked to 35.264 deg by the engine.
   */
  iso45: { label: "isometric 45", type: "isometric", angle: 45 },
};

/** @type {Record<string, Scene>} */
export const SCENES = {
  /** The boundary case: exactly one voxel, all six neighbour faces exposed. */
  single: {
    id: "single",
    label: "Single voxel (0,0,0)",
    build(h) {
      h.addGeometry({ type: "box", position: [0, 0, 0], size: 1 });
    },
  },
  /**
   * Two voxels stacked along the depth axis: (0,0,0) and (0,0,1).
   * Their touching z=1 / z=0 faces must be culled by the neighbour check, so
   * the back voxel contributes only its top + right faces (its front face is
   * the shared seam; its back face is culled by the oblique camera).
   */
  row: {
    id: "row",
    label: "Depth row (0,0,0)+(0,0,1)",
    build(h) {
      h.addGeometry({ type: "box", position: [0, 0, 0], size: [1, 1, 2] });
    },
  },
  /**
   * An L of three voxels around the origin:
   * A=(0,0,0), B=(1,0,0) along +X, C=(0,0,1) along +Z.
   * Each arm hides exactly one face of A, exercising both the x- and
   * z-direction neighbour culls plus a fully distinct depth ordering.
   */
  l: {
    id: "l",
    label: "L corner (0,0,0)+(1,0,0)+(0,0,1)",
    build(h) {
      h.addGeometry({
        type: "fill",
        bounds: [
          [-1, -1, -1],
          [3, 3, 3],
        ],
        test: (x, y, z) =>
          (x === 0 && y === 0 && z === 0) ||
          (x === 1 && y === 0 && z === 0) ||
          (x === 0 && y === 0 && z === 1),
      });
    },
  },
};

export const SCENE_IDS = ["single", "row", "l"];
export const CAMERA_IDS = ["oblique315", "iso45"];

/* ──────────────────────────────────────────────────────────────────────────
 * Oblique 315 deg derivation
 *
 * Projection of a world point (x, y, z) (tile = 10):
 *   px = 10x + 7.0711z
 *   py = 10y - 7.0711z
 * Painter depth (sorted back-to-front = descending):
 *   d = cz - cx*(7.0711/10) - cy*(-7.0711/10)
 *     = cz - 0.70711*cx + 0.70711*cy
 * Equal-depth faces (e.g. top vs. right of the same voxel) tie-break by
 * voxel x, then y, then z, then the lexicographic face name, which is why
 * "right" precedes "top".
 *
 * Visible set for every exposed voxel: {top, right, front}.
 *   - "back" (normal +z) always faces away from an oblique viewer;
 *   - sin315 < 0: the depth axis climbs the screen, so the camera sees the
 *     downward-pointing "top" and the "bottom" is hidden;
 *   - cos315 > 0: the depth axis recedes toward +x, so the +x "right" face
 *     shows and the "left" face is hidden;
 *   - "front" (normal -z) always faces the viewer.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Expected faces under the oblique 315 camera, keyed by scene id.
 * @type {Record<string, FaceDescriptor[]>}
 */
export const OBLIQUE_EXPECTED = {
  // Single voxel (0,0,0); the three visible faces share corner (0,0,0).
  // right, plane x=1, vertices (1,0,0)(1,0,1)(1,1,1)(1,1,0)
  //   -> (10,0) (17.0711,-7.0711) (17.0711,2.9289) (10,10)
  // top, plane y=0, vertices (0,0,0)(1,0,0)(1,0,1)(0,0,1)
  //   -> (0,0) (10,0) (17.0711,-7.0711) (7.0711,-7.0711)
  // front, plane z=0, vertices (0,0,0)(0,1,0)(1,1,0)(1,0,0)
  //   -> (0,0) (0,10) (10,10) (10,0)
  // Order: right and top share the voxel-centre depth, so the lexicographic
  // tie-break puts right first; front is the nearest face of the cube and
  // therefore paints last. This is the fixed polygon order an isolated cube
  // must have under a 315 deg cabinet projection.
  single: [
    {
      type: "right",
      voxel: [0, 0, 0],
      points: [10, 0, 17.0711, -7.0711, 17.0711, 2.9289, 10, 10],
    },
    {
      type: "top",
      voxel: [0, 0, 0],
      points: [0, 0, 10, 0, 17.0711, -7.0711, 7.0711, -7.0711],
    },
    {
      type: "front",
      voxel: [0, 0, 0],
      points: [0, 0, 0, 10, 10, 10, 10, 0],
    },
  ],

  // Depth row. The back voxel z=1 is displaced by exactly one depth vector,
  // so every point gains (7.0711, -7.0711) over its z=0 counterpart. Its
  // depth is exactly +1 greater, hence its two surviving faces paint first;
  // the front voxel keeps top/right/front because its back face is the
  // shared seam and is neighbour-culled. Total = 5 faces.
  row: [
    {
      type: "right",
      voxel: [0, 0, 1],
      points: [
        17.0711, -7.0711, 24.1421, -14.1421, 24.1421, -4.1421, 17.0711, 2.9289,
      ],
    },
    {
      type: "top",
      voxel: [0, 0, 1],
      points: [
        7.0711, -7.0711, 17.0711, -7.0711, 24.1421, -14.1421, 14.1421, -14.1421,
      ],
    },
    {
      type: "right",
      voxel: [0, 0, 0],
      points: [10, 0, 17.0711, -7.0711, 17.0711, 2.9289, 10, 10],
    },
    {
      type: "top",
      voxel: [0, 0, 0],
      points: [0, 0, 10, 0, 17.0711, -7.0711, 7.0711, -7.0711],
    },
    {
      type: "front",
      voxel: [0, 0, 0],
      points: [0, 0, 0, 10, 10, 10, 10, 0],
    },
  ],

  // L corner. C=(0,0,1) is farthest (depth +1) -> top/right first.
  // A=(0,0,0) then contributes top + front: its right face is the seam with
  // B=(1,0,0) and its back face is the seam with C, both neighbour-culled.
  // B=(1,0,0) is nearest along -X (depth offset -0.70711); its three exposed
  // faces paint last, with front (depth -0.70711) behind top/right
  // (-0.56066 = -0.70711 + 0.1464). Its left face is the seam with A.
  // Total = 7 faces.
  l: [
    {
      type: "right",
      voxel: [0, 0, 1],
      points: [
        17.0711, -7.0711, 24.1421, -14.1421, 24.1421, -4.1421, 17.0711, 2.9289,
      ],
    },
    {
      type: "top",
      voxel: [0, 0, 1],
      points: [
        7.0711, -7.0711, 17.0711, -7.0711, 24.1421, -14.1421, 14.1421, -14.1421,
      ],
    },
    {
      type: "top",
      voxel: [0, 0, 0],
      points: [0, 0, 10, 0, 17.0711, -7.0711, 7.0711, -7.0711],
    },
    {
      type: "front",
      voxel: [0, 0, 0],
      points: [0, 0, 0, 10, 10, 10, 10, 0],
    },
    {
      type: "right",
      voxel: [1, 0, 0],
      points: [20, 0, 27.0711, -7.0711, 27.0711, 2.9289, 20, 10],
    },
    {
      type: "top",
      voxel: [1, 0, 0],
      points: [10, 0, 20, 0, 27.0711, -7.0711, 17.0711, -7.0711],
    },
    {
      type: "front",
      voxel: [1, 0, 0],
      points: [10, 0, 10, 10, 20, 10, 20, 0],
    },
  ],
};

/* ──────────────────────────────────────────────────────────────────────────
 * Isometric 45 deg derivation (pitch locked to 35.264 deg)
 *
 * Rotation applied by _projectPoint (R = Rz-pan then Rx-pitch):
 *   x1 = x*cos45 - z*sin45
 *   y1 = y*cosP - (x*sin45 + z*cos45)*sinP
 *   px = 10*(x1 + 5),  py = 10*(y1 + 5)
 * With sin45 = 0.70710678, sinP = sin(35.264deg) = 0.57734472 and
 * cosP = 0.81650051, truncated to 4 decimals:
 *   px = trunc(50 + 7.0711*(x - z))
 *   py = trunc(50 + 8.165*y - 4.0824*(x + z))
 *
 * View vector = (sin45*cosP, sinP, cos45*cosP) = (+, +, +). A face survives
 * only when view . normal < 0, so the visible set of an exposed voxel is
 * {top (-y), left (-x), front (-z)}; {bottom, right, back} are back-face
 * culled. This is the geometric change vs. oblique315's {top, right, front}:
 * switching to iso45 swaps the visible x-face from right to left, and the
 * oblique "back" face remains unavailable in both views here.
 *
 * Face depth = cy*sinP + (cx*sin45 + cz*cos45)*cosP; the three faces of one
 * voxel share its centre depth analytically, but the float evaluation gives
 * the top face a marginally larger value, so it sorts first.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Expected faces under the isometric 45 camera, keyed by scene id.
 * @type {Record<string, FaceDescriptor[]>}
 */
export const ISO_EXPECTED = {
  // Single voxel. Projection spot checks from the formulas above:
  // (1,0,1) -> px 50, py = trunc(50 - 8.1649) = 41.8351 (top far corner);
  // (1,1,0) -> px 57.0711, py = trunc(50 + 8.1650 - 4.0824) = 54.0826
  // (front/right meeting edge, here the lower edge of the front quad).
  single: [
    {
      type: "top",
      voxel: [0, 0, 0],
      points: [50, 50, 57.0711, 45.9176, 50, 41.8351, 42.9289, 45.9176],
    },
    {
      type: "left",
      voxel: [0, 0, 0],
      points: [42.9289, 45.9176, 50, 50, 50, 58.165, 42.9289, 54.0826],
    },
    {
      type: "front",
      voxel: [0, 0, 0],
      points: [50, 50, 50, 58.165, 57.0711, 54.0826, 57.0711, 45.9176],
    },
  ],

  // Depth row. Every (x,y,z+1) point moves by (px -7.0711, py -4.0824)
  // because x1 decreases by sin45 and the depth term subtracts another
  // cos45*sinP in y1. The back voxel's centre depth is +cos45*cosP larger,
  // so its top/left faces paint first; its front is the shared seam.
  // Total = 5 faces.
  row: [
    {
      type: "top",
      voxel: [0, 0, 1],
      points: [
        42.9289, 45.9176, 50, 41.8351, 42.9289, 37.7527, 35.8579, 41.8351,
      ],
    },
    {
      type: "left",
      voxel: [0, 0, 1],
      points: [
        35.8579, 41.8351, 42.9289, 45.9176, 42.9289, 54.0826, 35.8579, 50.0001,
      ],
    },
    {
      type: "top",
      voxel: [0, 0, 0],
      points: [50, 50, 57.0711, 45.9176, 50, 41.8351, 42.9289, 45.9176],
    },
    {
      type: "left",
      voxel: [0, 0, 0],
      points: [42.9289, 45.9176, 50, 50, 50, 58.165, 42.9289, 54.0826],
    },
    {
      type: "front",
      voxel: [0, 0, 0],
      points: [50, 50, 50, 58.165, 57.0711, 54.0826, 57.0711, 45.9176],
    },
  ],

  // L corner. Both far-arm tops share the same depth value analytically
  // (cx = 1 and cz = 1 contribute equally under 45 deg); float evaluation
  // leaves C's top marginally farther so it precedes B's top. C then shows
  // its left face (its front is the seam against A), while B shows its front
  // face (its left is the seam against A). The two seam faces, plus A's
  // right and back faces, are all culled. A paints last with top/left/front.
  // Total = 7 faces.
  l: [
    {
      type: "top",
      voxel: [0, 0, 1],
      points: [
        42.9289, 45.9176, 50, 41.8351, 42.9289, 37.7527, 35.8579, 41.8351,
      ],
    },
    {
      type: "top",
      voxel: [1, 0, 0],
      points: [
        57.0711, 45.9176, 64.1421, 41.8351, 57.0711, 37.7527, 50, 41.8351,
      ],
    },
    {
      type: "left",
      voxel: [0, 0, 1],
      points: [
        35.8579, 41.8351, 42.9289, 45.9176, 42.9289, 54.0826, 35.8579, 50.0001,
      ],
    },
    {
      type: "front",
      voxel: [1, 0, 0],
      points: [
        57.0711, 45.9176, 57.0711, 54.0826, 64.1421, 50.0001, 64.1421, 41.8351,
      ],
    },
    {
      type: "top",
      voxel: [0, 0, 0],
      points: [50, 50, 57.0711, 45.9176, 50, 41.8351, 42.9289, 45.9176],
    },
    {
      type: "left",
      voxel: [0, 0, 0],
      points: [42.9289, 45.9176, 50, 50, 50, 58.165, 42.9289, 54.0826],
    },
    {
      type: "front",
      voxel: [0, 0, 0],
      points: [50, 50, 50, 58.165, 57.0711, 54.0826, 57.0711, 45.9176],
    },
  ],
};

/**
 * Expected tables keyed by camera id, consumed by both the test suite and the
 * docs-page regression panel.
 */
export const EXPECTED = {
  oblique315: OBLIQUE_EXPECTED,
  iso45: ISO_EXPECTED,
};
