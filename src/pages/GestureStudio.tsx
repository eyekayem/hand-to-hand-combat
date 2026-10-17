// Gesture Studio - Unified 2-hand interface for Teach/Test/Publish
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Camera, CameraOff } from 'lucide-react';
import { StudioViewport } from '@/components/StudioViewport';
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
  fingerStateFromExtensions,
  calculatePalmFacing,
  calculateHandRotation,
  matchGesture,
  generateGestureId,
} from '@/lib/gestureTypes';
import { LANDMARK_INDICES } from '@/lib/handTracking';
import { toast } from 'sonner';

type StudioMode = 'teach' | 'test' | 'library';

interface HandState {
  position: [number, number, number];
  rotation: [number, number, number];
}

const STORAGE_KEY = 'gesture-studio-gestures';

export default function GestureStudio() {
  // Mode
  const [mode, setMode] = useState<StudioMode>('teach');

  // Camera
  const [isCapturing, setIsCapturing] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  // Hand states
  const [userHand, setUserHand] = useState<HandState>({
    position: [0, 0, 150],
    rotation: [0, 0, 0],
  });
  const [appHand, setAppHand] = useState<HandState>({
    position: [0, 0, -150],
    rotation: [0, Math.PI, 0],
  });

  // Finger/orientation state
  const [currentFingers, setCurrentFingers] = useState<FingerState | null>(null);
  const [currentOrientation, setCurrentOrientation] = useState<HandOrientation | null>(null);

  // Teach mode state
  const [gestureName, setGestureName] = useState('');
  const [position1, setPosition1] = useState<GesturePosition | null>(null);
  const [position2, setPosition2] = useState<GesturePosition | null>(null);

  // Test mode state
  const [currentMatch, setCurrentMatch] = useState<GestureMatch | null>(null);
  const [allMatches, setAllMatches] = useState<GestureMatch[]>([]);

  // Library state
  const [gestures, setGestures] = useState<TrainedGesture[]>([]);
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(null);

  // Refs for smooth app hand mirroring
  const appHandTarget = useRef<HandState>({ position: [0, 0, -150], rotation: [0, Math.PI, 0] });

  // Load gestures from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setGestures(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load gestures:', e);
      }
    }
  }, []);

  // Save gestures to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gestures));
  }, [gestures]);

  // Calculate finger extension from landmarks
  const calculateFingerExtension = useCallback((
    landmarks: { x: number; y: number; z: number }[],
    mcpIdx: number,
    pipIdx: number,
    tipIdx: number
  ): number => {
    const mcp = landmarks[mcpIdx];
    const pip = landmarks[pipIdx];
    const tip = landmarks[tipIdx];

    const baseToTip = Math.sqrt(
      (tip.x - mcp.x) ** 2 + (tip.y - mcp.y) ** 2 + (tip.z - mcp.z) ** 2
    );
    const baseToPip = Math.sqrt(
      (pip.x - mcp.x) ** 2 + (pip.y - mcp.y) ** 2 + (pip.z - mcp.z) ** 2
    );
    const pipToTip = Math.sqrt(
      (tip.x - pip.x) ** 2 + (tip.y - pip.y) ** 2 + (tip.z - pip.z) ** 2
    );

    const maxExtension = baseToPip + pipToTip;
    return maxExtension > 0 ? Math.min(1, baseToTip / maxExtension) : 0;
  }, []);

  // Specialized thumb extension - measures lateral spread from palm
  const calculateThumbExtension = useCallback((
    landmarks: { x: number; y: number; z: number }[]
  ): number => {
    const wrist = landmarks[LANDMARK_INDICES.WRIST];
    const thumbTip = landmarks[LANDMARK_INDICES.THUMB_TIP];
    const thumbMcp = landmarks[LANDMARK_INDICES.THUMB_MCP];
    const indexMcp = landmarks[LANDMARK_INDICES.INDEX_MCP];
    const pinkyMcp = landmarks[LANDMARK_INDICES.PINKY_MCP];

    // Hand size for normalization
    const palmWidth = Math.sqrt(
      (indexMcp.x - pinkyMcp.x) ** 2 +
      (indexMcp.y - pinkyMcp.y) ** 2 +
      (indexMcp.z - pinkyMcp.z) ** 2
    );

    // Distance from thumb tip to index MCP (extended thumb = far from index)
    const thumbToIndex = Math.sqrt(
      (thumbTip.x - indexMcp.x) ** 2 +
      (thumbTip.y - indexMcp.y) ** 2 +
      (thumbTip.z - indexMcp.z) ** 2
    );

    // Distance from thumb MCP to tip (measures curl)
    const thumbLength = Math.sqrt(
      (thumbTip.x - thumbMcp.x) ** 2 +
      (thumbTip.y - thumbMcp.y) ** 2 +
      (thumbTip.z - thumbMcp.z) ** 2
    );

    // Combined metric: lateral spread + extension
    // Extended thumb: far from index, straight
    // Curled thumb: close to palm, bent
    const lateralRatio = thumbToIndex / (palmWidth * 1.5);
    const extensionRatio = thumbLength / (palmWidth * 0.8);

    // Weight lateral spread more (0.6) than pure extension (0.4)
    const combined = (lateralRatio * 0.6) + (extensionRatio * 0.4);

    return Math.min(1, Math.max(0, combined));
  }, []);

  // Process tracking data
  const handleTrackingUpdate = useCallback((state: TrackingState) => {
    // Use the first detected hand (prefer right)
    const hand = state.rightHand || state.leftHand;
    if (!hand) {
      setCurrentFingers(null);
      setCurrentOrientation(null);
      return;
    }

    const lm = hand.landmarks;
    const wlm = hand.worldLandmarks;

    // Calculate finger extensions - use specialized algorithm for thumb
    const thumbExt = calculateThumbExtension(lm);
    const indexExt = calculateFingerExtension(lm, LANDMARK_INDICES.INDEX_MCP, LANDMARK_INDICES.INDEX_PIP, LANDMARK_INDICES.INDEX_TIP);
    const middleExt = calculateFingerExtension(lm, LANDMARK_INDICES.MIDDLE_MCP, LANDMARK_INDICES.MIDDLE_PIP, LANDMARK_INDICES.MIDDLE_TIP);
    const ringExt = calculateFingerExtension(lm, LANDMARK_INDICES.RING_MCP, LANDMARK_INDICES.RING_PIP, LANDMARK_INDICES.RING_TIP);
    const pinkyExt = calculateFingerExtension(lm, LANDMARK_INDICES.PINKY_MCP, LANDMARK_INDICES.PINKY_PIP, LANDMARK_INDICES.PINKY_TIP);

    const fingers = fingerStateFromExtensions(thumbExt, indexExt, middleExt, ringExt, pinkyExt);
    setCurrentFingers(fingers);

    // Calculate orientation
    const palmFacing = calculatePalmFacing(
      wlm[LANDMARK_INDICES.WRIST],
      wlm[LANDMARK_INDICES.INDEX_MCP],
      wlm[LANDMARK_INDICES.PINKY_MCP],
      wlm[LANDMARK_INDICES.MIDDLE_MCP]
    );
    const { rotation, tilt } = calculateHandRotation(
      wlm[LANDMARK_INDICES.WRIST],
      wlm[LANDMARK_INDICES.MIDDLE_MCP]
    );
    const orientation: HandOrientation = { palmFacing, rotation, tilt };
    setCurrentOrientation(orientation);

    // Update user hand position from tracking
    const wrist = lm[LANDMARK_INDICES.WRIST];
    const worldWrist = wlm[LANDMARK_INDICES.WRIST];

    const userX = (wrist.x - 0.5) * 400;
    const userY = (0.5 - wrist.y) * 300;
    const userZ = 150 + (worldWrist.z * 200);

    setUserHand({
      position: [userX, userY, userZ],
      rotation: [0, 0, rotation],
    });

    // App hand behavior based on mode
    if (mode === 'teach') {
      // Mirror user hand loosely
      appHandTarget.current = {
        position: [-userX * 0.8, userY * 0.8, -150],
        rotation: [0, Math.PI, -rotation],
      };
    } else if (mode === 'test') {
      // Match gestures
      const matches: GestureMatch[] = [];
      for (const gesture of gestures) {
        const match = matchGesture(fingers, orientation, gesture);
        if (match) {
          matches.push(match);
        }
      }
      matches.sort((a, b) => b.confidence - a.confidence);
      setAllMatches(matches);
      setCurrentMatch(matches[0] || null);

      // App hand shows matched gesture pose
      if (matches[0] && matches[0].confidence > 0.7) {
        appHandTarget.current = {
          position: [0, 0, -150],
          rotation: [0, Math.PI, 0],
        };
      }
    } else if (mode === 'library' && selectedGestureId) {
      // Demo selected gesture
      const selected = gestures.find(g => g.id === selectedGestureId);
      if (selected) {
        appHandTarget.current = {
          position: [0, 0, -150],
          rotation: [0, Math.PI, 0],
        };
      }
    }
  }, [mode, gestures, selectedGestureId, calculateFingerExtension]);

  // Smooth app hand movement
  useEffect(() => {
    const interval = setInterval(() => {
      setAppHand(prev => ({
        position: [
          prev.position[0] + (appHandTarget.current.position[0] - prev.position[0]) * 0.1,
          prev.position[1] + (appHandTarget.current.position[1] - prev.position[1]) * 0.1,
          prev.position[2] + (appHandTarget.current.position[2] - prev.position[2]) * 0.1,
        ],
        rotation: [
          prev.rotation[0] + (appHandTarget.current.rotation[0] - prev.rotation[0]) * 0.1,
          prev.rotation[1] + (appHandTarget.current.rotation[1] - prev.rotation[1]) * 0.1,
          prev.rotation[2] + (appHandTarget.current.rotation[2] - prev.rotation[2]) * 0.1,
        ],
      }));
    }, 16);
    return () => clearInterval(interval);
  }, []);

  // Capture gesture position
  const capturePosition = useCallback((positionNumber: 1 | 2) => {
    if (!currentFingers || !currentOrientation) {
      toast.error('No hand detected');
      return;
    }

    const position: GesturePosition = {
      fingerState: { ...currentFingers },
      orientation: { ...currentOrientation },
    };

    if (positionNumber === 1) {
      setPosition1(position);
      toast.success('Position 1 captured');
    } else {
      setPosition2(position);
      toast.success('Position 2 captured');
    }
  }, [currentFingers, currentOrientation]);

  // Save gesture
  const saveGesture = useCallback(() => {
    if (!gestureName.trim() || !position1 || !position2) return;

    const newGesture: TrainedGesture = {
      id: generateGestureId(),
      name: gestureName.trim(),
      position1,
      position2,
      transitionMs: 500,
      hand: 'right',
      createdAt: Date.now(),
    };

    setGestures(prev => [...prev, newGesture]);
    setGestureName('');
    setPosition1(null);
    setPosition2(null);
    toast.success(`Gesture "${newGesture.name}" saved!`);
  }, [gestureName, position1, position2]);

  // Clear teaching state
  const clearTeaching = useCallback(() => {
    setGestureName('');
    setPosition1(null);
    setPosition2(null);
  }, []);

  // Delete gesture
  const deleteGesture = useCallback((id: string) => {
    setGestures(prev => prev.filter(g => g.id !== id));
    if (selectedGestureId === id) {
      setSelectedGestureId(null);
    }
    toast.success('Gesture deleted');
  }, [selectedGestureId]);

  // Export gestures
  const exportGestures = useCallback(() => {
    const data = JSON.stringify(gestures, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gestures.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Gestures exported');
  }, [gestures]);

  // Import gestures
  const importGestures = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          if (Array.isArray(imported)) {
            setGestures(prev => [...prev, ...imported]);
            toast.success(`Imported ${imported.length} gestures`);
          }
        } catch (err) {
          toast.error('Invalid file format');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsCapturing(prev => !prev);
          break;
        case '1':
          if (mode === 'teach') capturePosition(1);
          break;
        case '2':
          if (mode === 'teach') capturePosition(2);
          break;
        case 's':
        case 'S':
          if (mode === 'teach' && gestureName && position1 && position2) {
            saveGesture();
          }
          break;
        case 'Tab':
          e.preventDefault();
          setMode(prev =>
            prev === 'teach' ? 'test' : prev === 'test' ? 'library' : 'teach'
          );
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, capturePosition, saveGesture, gestureName, position1, position2]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
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

        <Tabs value={mode} onValueChange={(v) => setMode(v as StudioMode)}>
          <TabsList>
            <TabsTrigger value="teach">Teach</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {isCapturing ? (
            <Camera className="w-4 h-4 text-green-500" />
          ) : (
            <CameraOff className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm text-muted-foreground">
            {isCapturing ? 'Live' : 'Off'}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Viewport */}
        <div className="flex-1">
          <StudioViewport
            userHand={userHand}
            appHand={appHand}
          />
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l bg-card flex flex-col">
          {/* Camera Controls */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="capture-toggle">Camera</Label>
              <Switch
                id="capture-toggle"
                checked={isCapturing}
                onCheckedChange={setIsCapturing}
              />
            </div>

            {isCapturing && (
              <div className="flex items-center justify-between">
                <Label htmlFor="preview-toggle" className="text-xs">Show Preview</Label>
                <Switch
                  id="preview-toggle"
                  checked={showPreview}
                  onCheckedChange={setShowPreview}
                />
              </div>
            )}

            {isCapturing && showPreview && (
              <div className="rounded overflow-hidden">
                <LiveCapture
                  isActive={isCapturing}
                  onTrackingUpdate={handleTrackingUpdate}
                  showVideo={true}
                />
              </div>
            )}

            {isCapturing && !showPreview && (
              <LiveCapture
                isActive={isCapturing}
                onTrackingUpdate={handleTrackingUpdate}
                showVideo={false}
              />
            )}
          </div>

          {/* Mode Content */}
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
