# Hand to Hand Combat

A vision app that answers your hand signals: friendly, aggressive, playful and challenging. Webcam hand tracking with MediaPipe, a call-and-response arena, and a Gesture Studio for teaching new gestures.

Originally prototyped in Lovable (project `5b34141e`), now developed here directly.

## Run

```sh
npm install
npm run dev      # http://localhost:8080/h2h/
npm test         # unit tests (vitest)
npm run lint
npm run build
```

Needs a webcam and network access to `cdn.jsdelivr.net` (MediaPipe WASM, drei fonts) and `storage.googleapis.com` (hand model).

## Hosting

Public at **bklt.ai/h2h**, no sign-in. This repo deploys as its own Vercel project (team `bkltai`) with base path `/h2h/` (build output in `dist/h2h`). The `bklt-mvp` project proxies `/h2h/*` to it via a rewrite in its `vercel.json`, so pushes here never redeploy bklt.ai.

## Routes

| Route | What |
|---|---|
| `/h2h/` | Arena: make a built-in gesture, hold still, the app hand responds |
| `/h2h/studio` | Gesture Studio: Teach, Test, Library for custom gestures |

## How it works

```
webcam (60 fps requested)
  -> MediaPipe HandLandmarker (1 hand in the arena, 2 in the Studio)
  -> One Euro smoothing per physical hand (~16 ms lag in motion)
  -> hand/handGeometry: finger curl from joint angles, thumb from bend + reach,
     palm normal, roll, rotation-invariant shape vector (world landmarks)
  -> arena:  graph/gestureGraph (DAG, every frame) -> ResponseFollower (30 ms) -> app hand
  -> studio: gestureTypes kNN on shape + orientation, GestureSequencer
```

### The gesture graph (arena)

Nodes have soft conditions (0..1). A child's score is its condition times its
parent's score, so partial evidence lights the shared parent first and the
children split it as the hand resolves:

```
Closing (4 fingers curling)      -> middle finger starts rising
  Fist (thumb in)                -> middle finger
  Thumbs up (thumb out + up)     -> thumbs up
  Thumbs down (thumb out + down) -> thumbs down
Point  -> points back
Peace  -> peace
Open   -> open palm
  Wave -> waves
```

Each node's response pose is blended by its residual weight (its score minus
what its children claim), plus an idle pose for the remainder. No hold timer:
the app hand eases toward the blend with a 30 ms time constant (~80% in 50 ms)
and retargets as soon as the input moves. `CommitTracker` adds a stable label
after an 80 ms dwell, for UI or sound.

To add a gesture, add a node to `DEFAULT_GRAPH` (parents listed first) with a
`when` condition and a `response` pose. The debug panel shows every node live.

### Latency budget

| Stage | Cost |
|---|---|
| Camera frame | 16 to 33 ms (60 or 30 fps) |
| MediaPipe inference (GPU) | ~5 to 15 ms |
| Smoothing | ~16 ms in motion |
| Response follower | 30 ms time constant |

### Loading

`scripts/fetch-mediapipe.mjs` (runs before dev and build) stages the MediaPipe
WASM from `node_modules` and downloads the hand model into `public/mediapipe/`,
so both are served from our origin with immutable caching. If staging fails the
app falls back to the CDNs. The Studio (three.js) is a separate lazy chunk.

## Key files

- `src/lib/hand/handGeometry.ts`: all tracked-hand math.
- `src/lib/hand/handModel.ts`: parametric hand (fingers + roll + thumb angle to landmarks). Draws the app hand and builds test fixtures.
- `src/lib/hand/oneEuro.ts`: smoothing, tuned per coordinate space.
- `src/lib/graph/gestureGraph.ts`: the arena's gesture DAG, response blending, follower.
- `src/lib/graph/motion.ts`: continuous wave strength.
- `src/lib/gestureTypes.ts`: Studio templates (format v2), matching, sequencing.
- `src/lib/handTracking.ts`: MediaPipe setup, self-hosted assets with CDN fallback.

Notes:

- MediaPipe labels handedness assuming a mirrored frame; we feed raw webcam frames, so `physicalHandFromLabel` swaps it.
- Thumb thresholds in `handGeometry.ts` and the membership curves in `gestureGraph.ts` are first-pass values. Tune against the live debug panel.
- Gestures saved by the Lovable build (format v1) are dropped on load; re-teach them.
