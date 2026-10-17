// Library Panel - View and manage saved gestures
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Play, Download, Upload } from 'lucide-react';
import type { TrainedGesture } from '@/lib/gestureTypes';

interface LibraryPanelProps {
  gestures: TrainedGesture[];
  selectedGestureId: string | null;
  onSelectGesture: (id: string | null) => void;
  onDeleteGesture: (id: string) => void;
  onExportGestures: () => void;
  onImportGestures: () => void;
}

function GestureCard({
  gesture,
  isSelected,
  onSelect,
  onDelete,
}: {
  gesture: TrainedGesture;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const fingerSummary = (pos: typeof gesture.position1) => {
    const f = pos.fingerState;
    return `${Math.round(f.thumb * 100)}/${Math.round(f.index * 100)}/${Math.round(f.middle * 100)}`;
  };

  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-muted-foreground'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-medium text-sm">{gesture.name}</h4>
          <p className="text-[10px] text-muted-foreground">
            {new Date(gesture.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {gesture.hand}
        </Badge>
      </div>

      <div className="flex gap-2 text-[10px] text-muted-foreground mb-2">
        <span>P1: {fingerSummary(gesture.position1)}</span>
        <span>→</span>
        <span>P2: {fingerSummary(gesture.position2)}</span>
      </div>

      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <Play className="w-3 h-3 mr-1" />
          Demo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export function LibraryPanel({
  gestures,
  selectedGestureId,
  onSelectGesture,
  onDeleteGesture,
  onExportGestures,
  onImportGestures,
}: LibraryPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Actions */}
      <div className="flex gap-2 mb-4">
        <Button
          size="sm"
          variant="outline"
          onClick={onExportGestures}
          disabled={gestures.length === 0}
          className="flex-1"
        >
          <Download className="w-3 h-3 mr-1" />
          Export
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onImportGestures}
          className="flex-1"
        >
          <Upload className="w-3 h-3 mr-1" />
          Import
        </Button>
      </div>

      {/* Gesture List */}
      {gestures.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <p className="text-sm">No gestures saved</p>
          <p className="text-xs mt-1">Go to Teach tab to create one</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 -mx-1 px-1">
          <div className="space-y-2">
            {gestures.map((gesture) => (
              <GestureCard
                key={gesture.id}
                gesture={gesture}
                isSelected={selectedGestureId === gesture.id}
                onSelect={() => onSelectGesture(
                  selectedGestureId === gesture.id ? null : gesture.id
                )}
                onDelete={() => onDeleteGesture(gesture.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Stats */}
      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Total gestures</span>
          <span className="font-mono">{gestures.length}</span>
        </div>
      </div>
    </div>
  );
}
