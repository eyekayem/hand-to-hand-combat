# Hand to Hand Combat

A vision app that answers your hand signals: friendly, aggressive, playful and challenging. Webcam hand tracking with MediaPipe, a call-and-response arena, and a Gesture Studio for teaching new gestures.

Originally prototyped in Lovable (project `5b34141e`), now developed here directly.

## Run

```sh
npm install
npm run dev      # http://localhost:8080
npm test         # unit tests (vitest)
npm run lint
npm run build
```

Needs a webcam and network access to `cdn.jsdelivr.net` (MediaPipe WASM, drei fonts) and `storage.googleapis.com` (hand model).

## Routes

| Route | What |
|---|---|
| `/` | Arena: make a built-in gesture, hold still, the app hand responds |
| `/studio` | Gesture Studio: Teach, Test, Library for custom gestures |

## How recognition works

```
webcam -> MediaPipe HandLandmarker -> One Euro smoothing (per physical hand)
       -> hand/handGeometry (world landmarks)
            fingers: joint-angle curl, thumb = bend + reach
            orientation: palm normal (handedness-corrected), roll
            shape vector: landmarks in the hand's own frame
       -> arena:  features.ts rules (FIST, OPEN, PEACE, POINT, THUMBS_UP, WAVE)
       -> studio: gestureTypes.ts kNN on shape + orientation score,
                  GestureSequencer for hold / two-position gestures
```

Key files:

- `src/lib/hand/handGeometry.ts`: all hand math. One source of truth for both pages.
- `src/lib/hand/oneEuro.ts`: landmark smoothing.
- `src/lib/gestureTypes.ts`: templates (format v2), matching, sequencing, validation.
- `src/lib/features.ts`: built-in arena gestures.
- `src/lib/behaviorEngine.ts`: call-and-response logic.
- `src/lib/handTracking.ts`: MediaPipe setup (version pinned to match `package.json`).

Notes:

- MediaPipe labels handedness assuming a mirrored frame; we feed raw webcam frames, so `physicalHandFromLabel` swaps it.
- Thumb thresholds in `handGeometry.ts` are first-pass anatomical values. Calibrate with real captures using the Studio's live readout.
- Gestures saved by the Lovable build (format v1) are dropped on load; re-teach them.
