// Gesture Studio: teach, test and manage gestures with the shared matcher.
// Tracking runs at camera rate into refs; React state is only touched for
// throttled readouts (~10 Hz) and discrete events.
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Camera, CameraOff } from 'lucide-react';
import { StudioViewport, type HandState } from '@/components/StudioViewport';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TeachPanel } from '@/components/TeachPanel';
import { TestPanel } from '@/components/TestPanel';
import { LibraryPanel } from '@/components/LibraryPanel';
import { LiveCapture, type TrackingState } from '@/components/LiveCapture';
import {
  type FingerState,
  type HandOrientation,
  type GesturePosition,
  type TrainedGesture,
  type GestureMatch,
  type HandFrame,
  GESTURE_FORMAT_VERSION,
  DEFAULT_ORIENTATION_WEIGHT,
  GestureSequencer,
  buildFrame,
  positionFromFrames,
  matchAll,
  parseGestures,
  generateGestureId,
} from '@/lib/gestureTypes';
import { L } from '@/lib/hand/handGeometry';
import { toast } from 'sonner';

type StudioMode = 'teach' | 'test' | 'library';
const MODES: StudioMode[] = ['teach', 'test', 'library'];

const STORAGE_KEY = 'gesture-studio-gestures';
const UI_INTERVAL_MS = 100;
const CAPTURE_MS = 600;
const CAPTURE_MIN_FRAMES = 8;

function loadGestures(): TrainedGesture[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const { gestures, rejected } = parseGestures(JSON.parse(raw));
    if (rejected > 0) {
      toast.warning(`${rejected} saved gesture${rejected === 1 ? '' : 's'} used the old format and were dropped. Re-teach them.`);
    }
    return gestures;
  } catch (e) {
    console.error('Failed to load gestures:', e);
    return [];
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export default function GestureStudio() {
  const [mode, setMode] = useState<StudioMode>('teach');
  const [isCapturing, setIsCapturing] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // Throttled readouts.
  const [currentFingers, setCurrentFingers] = useState<FingerState | null>(null);
  const [currentOrientation, setCurrentOrientation] = useState<HandOrientation | null>(null);
  const [currentMatch, setCurrentMatch] = useState<GestureMatch | null>(null);
  const [allMatches, setAllMatches] = useState<GestureMatch[]>([]);

  // Teach.
  const [gestureName, setGestureName] = useState('');
  const [position1, setPosition1] = useState<GesturePosition | null>(null);
  const [position2, setPosition2] = useState<GesturePosition | null>(null);
  const [recording, setRecording] = useState<1 | 2 | null>(null);

  // Library.
  const [gestures, setGestures] = useState<TrainedGesture[]>(loadGestures);
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(null);

  // Live, per-frame state (no re-renders).
  const userHand = useRef<HandState>({ position: [0, 0, 150], rotation: [0, 0, 0] });
  const appHandTarget = useRef<HandState>({ position: [0, 0, -150], rotation: [0, Math.PI, 0] });
  const frameRef = useRef<HandFrame | null>(null);
  const recordRef = useRef<{ which: 1 | 2; frames: HandFrame[]; until: number } | null>(null);
  const sequencer = useRef(new GestureSequencer());
  const lastUi = useRef(0);
  const modeRef = useRef(mode);
  const gesturesRef = useRef(gestures);
  modeRef.current = mode;
  gesturesRef.current = gestures;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gestures));
    } catch (e) {
      console.error('Failed to save gestures:', e);
    }
  }, [gestures]);

  useEffect(() => {
    sequencer.current.reset();
  }, [gestures, mode]);

  const finishRecording = useCallback(() => {
    const rec = recordRef.current;
    recordRef.current = null;
    setRecording(null);
    if (!rec) return;
    if (rec.frames.length < CAPTURE_MIN_FRAMES) {
      toast.error(`Lost the hand during capture (${rec.frames.length} frames). Try again.`);
      return;
    }
    const pos = positionFromFrames(rec.frames);
    (rec.which === 1 ? setPosition1 : setPosition2)(pos);
    toast.success(`Position ${rec.which} captured (${rec.frames.length} frames)`);
  }, []);

  const handleTrackingUpdate = useCallback((state: TrackingState) => {
    const hand = state.rightHand || state.leftHand;
    const t = state.t;
    const frame = hand ? buildFrame(hand, t) : null;
    frameRef.current = frame;

    // Recording a position.
    const rec = recordRef.current;
    if (rec) {
      if (frame) rec.frames.push(frame);
      if (t >= rec.until) finishRecording();
    }

    if (frame && hand) {
      const wrist = hand.landmarks[L.WRIST];
      const userX = (0.5 - wrist.x) * 400; // mirrored to match the user's view
      const userY = (0.5 - wrist.y) * 300;
      userHand.current = { position: [userX, userY, 150], rotation: [0, 0, -frame.orientation.rotation] };
      if (modeRef.current === 'teach') {
        appHandTarget.current = { position: [userX * 0.8, userY * 0.8, -150], rotation: [0, Math.PI, frame.orientation.rotation] };
      }
    }

    // Discrete gesture events.
    if (modeRef.current === 'test') {
      for (const g of sequencer.current.update(frame, gesturesRef.current, t)) {
        toast(`Recognised: ${g.name}`);
        appHandTarget.current = { position: [0, 40, -120], rotation: [0, Math.PI, 0] };
      }
    }

    // Throttled readouts.
    if (t - lastUi.current < UI_INTERVAL_MS && frame) return;
    lastUi.current = t;
    setCurrentFingers(frame ? frame.geometry.fingers : null);
    setCurrentOrientation(frame ? frame.orientation : null);
    if (modeRef.current === 'test') {
      const matches = frame ? matchAll(frame, gesturesRef.current) : [];
      setAllMatches(matches);
      setCurrentMatch(matches[0] ?? null);
    }
  }, [finishRecording]);

  const capturePosition = useCallback((which: 1 | 2) => {
    if (recordRef.current) return;
    if (!frameRef.current) {
      toast.error('No hand detected');
      return;
    }
    recordRef.current = { which, frames: [], until: performance.now() + CAPTURE_MS };
    setRecording(which);
  }, []);

  // If the camera stops mid-capture, close the recording out.
  useEffect(() => {
    if (!isCapturing && recordRef.current) finishRecording();
  }, [isCapturing, finishRecording]);

  const saveGesture = useCallback(() => {
    if (!gestureName.trim() || !position1 || !position2) return;
    const newGesture: TrainedGesture = {
      version: GESTURE_FORMAT_VERSION,
      id: generateGestureId(),
      name: gestureName.trim(),
      position1,
      position2,
      transitionMs: 500,
      orientationWeight: DEFAULT_ORIENTATION_WEIGHT,
      hand: 'both',
      createdAt: Date.now(),
    };
    setGestures(prev => [...prev, newGesture]);
    setGestureName('');
    setPosition1(null);
    setPosition2(null);
    toast.success(`Gesture "${newGesture.name}" saved`);
  }, [gestureName, position1, position2]);

  const clearTeaching = useCallback(() => {
    setGestureName('');
    setPosition1(null);
    setPosition2(null);
  }, []);

  const deleteGesture = useCallback((id: string) => {
    setGestures(prev => prev.filter(g => g.id !== id));
    setSelectedGestureId(cur => (cur === id ? null : cur));
    toast.success('Gesture deleted');
  }, []);

  const exportGestures = useCallback(() => {
    const blob = new Blob([JSON.stringify(gestures, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gestures.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Gestures exported');
  }, [gestures]);

  const importGestures = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const { gestures: incoming, rejected } = parseGestures(JSON.parse(ev.target?.result as string));
          let added = 0;
          setGestures(prev => {
            const ids = new Set(prev.map(g => g.id));
            const fresh = incoming.filter(g => !ids.has(g.id));
            added = fresh.length;
            return [...prev, ...fresh];
          });
          toast.success(`Imported ${added} gesture${added === 1 ? '' : 's'}${rejected ? `, skipped ${rejected} invalid` : ''}`);
        } catch {
          toast.error('Invalid file format');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsCapturing(prev => !prev);
          break;
        case '1':
        case '2':
          if (mode === 'teach') capturePosition(e.key === '1' ? 1 : 2);
          break;
        case 's':
        case 'S':
          if (mode === 'teach') saveGesture();
          break;
        case 'm':
        case 'M':
          setMode(prev => MODES[(MODES.indexOf(prev) + 1) % MODES.length]);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, capturePosition, saveGesture]);

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Home
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Gesture Studio</h1>
        </div>

        <Tabs value={mode} onValueChange={v => setMode(v as StudioMode)}>
          <TabsList>
            <TabsTrigger value="teach">Teach</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {isCapturing ? <Camera className="w-4 h-4 text-primary" /> : <CameraOff className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm text-muted-foreground">{isCapturing ? 'Live' : 'Off'}</span>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          <ErrorBoundary
            name="StudioViewport"
            fallback={<div className="h-full flex items-center justify-center text-sm text-muted-foreground">3D view unavailable. Tracking still works.</div>}
          >
            <StudioViewport userHand={userHand} appHandTarget={appHandTarget} />
          </ErrorBoundary>
        </div>

        <div className="w-80 border-l bg-card flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="capture-toggle">Camera</Label>
              <Switch id="capture-toggle" checked={isCapturing} onCheckedChange={setIsCapturing} />
            </div>
            {isCapturing && (
              <div className="flex items-center justify-between">
                <Label htmlFor="preview-toggle" className="text-xs">Show Preview</Label>
                <Switch id="preview-toggle" checked={showPreview} onCheckedChange={setShowPreview} />
              </div>
            )}
            {/* Always mounted; showVideo only hides the preview. */}
            <LiveCapture
              isActive={isCapturing}
              showVideo={isCapturing && showPreview}
              onTrackingUpdate={handleTrackingUpdate}
              onError={msg => {
                toast.error(msg);
                setIsCapturing(false);
              }}
            />
          </div>

          <div className="flex-1 p-4 overflow-y-auto">
            {mode === 'teach' && (
              <TeachPanel
                gestureName={gestureName}
                onNameChange={setGestureName}
                position1={position1}
                position2={position2}
                onCapturePosition={capturePosition}
                onSave={saveGesture}
                onClear={clearTeaching}
                currentFingers={currentFingers}
                currentOrientation={currentOrientation}
                isCapturing={isCapturing}
                recording={recording}
              />
            )}
            {mode === 'test' && (
              <TestPanel
                isCapturing={isCapturing}
                currentMatch={currentMatch}
                allMatches={allMatches}
                gestures={gestures}
                currentFingers={currentFingers}
                currentOrientation={currentOrientation}
              />
            )}
            {mode === 'library' && (
              <LibraryPanel
                gestures={gestures}
                selectedGestureId={selectedGestureId}
                onSelectGesture={setSelectedGestureId}
                onDeleteGesture={deleteGesture}
                onExportGestures={exportGestures}
                onImportGestures={importGestures}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
