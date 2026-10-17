
# Simplified Gesture Studio: 2-Hand Interface with Teach/Test/Publish Loop

## Overview

Consolidate the blocking tool and gesture trainer into a single **Gesture Studio** with just two hands (User and App), focused on a clear workflow: **Teach** a gesture, **Test** recognition, **Publish** for use in the main arena.

---

## Interface Alternatives

### Option A: Unified Split-Pane Studio (Recommended)

```text
+----------------------------------------------------------+
|  Gesture Studio                    [Teach] [Test] [Lib]  |
+----------------------------------------------------------+
|                         |                                |
|     3D Viewport         |        Control Panel           |
|  +----------------+     |  +-------------------------+   |
|  |                |     |  | Camera Preview    [ON]  |   |
|  |   [User]       |     |  | +-------------------+   |   |
|  |      o         |     |  | |                   |   |   |
|  |                |     |  | +-------------------+   |   |
|  |      o         |     |  |                         |   |
|  |   [App]        |     |  | Current State           |   |
|  |                |     |  | Fingers: T:80 I:100...  |   |
|  +----------------+     |  | Orient: camera / 12deg  |   |
|                         |  |                         |   |
|  [Front] [Side] [Top]   |  | --- Mode Content ---    |   |
|                         |  | (Teach/Test/Lib panels) |   |
+----------------------------------------------------------+
```

**Key features:**
- Single 3D viewport shows both User (cyan) and App (coral) hands
- Tab-based workflow: Teach | Test | Library
- Collapsible camera preview in sidebar
- App hand mirrors/responds to user hand in real-time

---

### Option B: Step-by-Step Wizard

```text
+----------------------------------------------------------+
|  Step 1 of 4: Name Your Gesture                          |
+----------------------------------------------------------+
|                                                          |
|    What do you want to call this gesture?                |
|    +------------------------------------------+          |
|    | Peace Sign                               |          |
|    +------------------------------------------+          |
|                                                          |
|    [Back]                              [Next: Capture]   |
+----------------------------------------------------------+
```

Linear flow: Name -> Capture Position 1 -> Capture Position 2 -> Save

**Pros:** Very guided, low cognitive load  
**Cons:** Slower iteration, harder to refine gestures

---

### Option C: Card-Based Dashboard

```text
+----------------------------------------------------------+
|  Gesture Library                    [+ New Gesture]      |
+----------------------------------------------------------+
|  +-------------+  +-------------+  +-------------+       |
|  | Peace Sign  |  | Thumbs Up   |  | Wave        |       |
|  | [Test] [Ed] |  | [Test] [Ed] |  | [Test] [Ed] |       |
|  +-------------+  +-------------+  +-------------+       |
|                                                          |
|  +-------------+  +-------------+                        |
|  | Fist        |  | Point       |                        |
|  | [Test] [Ed] |  | [Test] [Ed] |                        |
|  +-------------+  +-------------+                        |
+----------------------------------------------------------+
```

**Pros:** Quick overview, fast access to individual gestures  
**Cons:** No live visualization, requires modal for teaching

---

## Recommended Implementation: Option A (Split-Pane Studio)

### Technical Changes

**1. Simplify State Model**
- Remove `userLeft`, `userRight`, `appLeft`, `appRight`
- Replace with `user: HandState` and `app: HandState`
- Single hand selection toggle instead of 4-way

**2. New File Structure**
```
src/pages/GestureStudio.tsx     (replaces both BlockingTool + GestureTrainer)
src/components/StudioViewport.tsx  (3D canvas with 2 hands)
src/components/TeachPanel.tsx      (gesture capture UI)
src/components/TestPanel.tsx       (recognition testing)
src/components/LibraryPanel.tsx    (saved gestures list)
```

**3. Mode-Based Sidebar**

| Mode | Panel Content |
|------|---------------|
| **Teach** | Name input, Position 1/2 capture buttons, finger state display, Save button |
| **Test** | Live recognition results, confidence meters, matched gesture highlight |
| **Library** | List of saved gestures, edit/delete actions, export/publish buttons |

**4. App Hand Behavior**
- **Teach mode:** App hand mirrors user hand loosely (for visual reference)
- **Test mode:** App hand shows the recognized gesture pose when matched
- **Library mode:** App hand demonstrates selected gesture on hover

**5. Simplified 3D Scene**
```text
         -Z
          |
    [App Hand] (coral)
          |
     -----+-----  center plane
          |
   [User Hand] (cyan)
          |
         +Z
```

- User hand at Z = +150
- App hand at Z = -150
- Both face center (toward each other)

**6. Keyboard Shortcuts**
- `Space`: Toggle camera capture
- `1`: Capture Position 1
- `2`: Capture Position 2
- `S`: Save gesture (when valid)
- `Tab`: Cycle modes

---

### Data Flow

```text
Camera -> MediaPipe -> TrackedHand
                          |
                          v
              +------------------------+
              | Process to FingerState |
              | + Orientation          |
              +------------------------+
                          |
          +---------------+---------------+
          |               |               |
          v               v               v
     [Teach Mode]    [Test Mode]    [Update User Hand]
     capture pos     match gesture       |
                                         v
                                    [App Hand Logic]
                                    mirror/respond/demo
```

---

### Publish Feature (Future)

Add export capability to Library panel:
- Export gesture definitions as JSON
- Import into main HandArena for use in call/response
- Gesture becomes available in `GESTURE_POSES` mapping

---

## Implementation Steps

1. Create `GestureStudio.tsx` with simplified 2-hand state
2. Build `StudioViewport.tsx` component with User + App hands
3. Implement tabbed sidebar with Teach/Test/Library panels
4. Wire up live capture to drive user hand
5. Add app hand mirroring logic in Teach mode
6. Integrate gesture matching from existing `gestureTypes.ts` in Test mode
7. Build Library panel with gesture cards and publish action
8. Update routing: `/studio` replaces `/blocking` and `/trainer`
9. Add keyboard shortcuts for fast workflow
