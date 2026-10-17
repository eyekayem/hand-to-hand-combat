import { useState, useCallback } from 'react';
import { HandArena, type ArenaSnapshot } from '@/components/HandArena';
import { NavLink } from '@/components/NavLink';
import { DEFAULT_GRAPH, MOODS, MOOD_RGB } from '@/lib/graph/gestureGraph';
import type { FingerState } from '@/lib/hand/handGeometry';

const FINGERS: (keyof FingerState)[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const DEPTH = new Map(DEFAULT_GRAPH.map(n => [n.id, n.parents?.length ? 1 : 0]));

function Bar({ value, color = 'hsl(var(--primary))', dim = false }: { value: number; color?: string; dim?: boolean }) {
  return (
    <div className="h-1.5 flex-1 rounded bg-muted overflow-hidden">
      <div className="h-full rounded" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color, opacity: dim ? 0.45 : 1 }} />
    </div>
  );
}

const Index = () => {
  const [cameraActive, setCameraActive] = useState(false);
  const [snap, setSnap] = useState<ArenaSnapshot | null>(null);
  const onSnapshot = useCallback((s: ArenaSnapshot) => setSnap(s), []);

  const live = cameraActive && snap;
  const committedLabel = live && snap.committed ? DEFAULT_GRAPH.find(n => n.id === snap.committed)?.label : null;
  const moodTop = live ? MOODS.reduce((a, b) => (snap.app.mood[a] >= snap.app.mood[b] ? a : b)) : 'neutral';

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
      <header className="flex-shrink-0 px-6 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold glow-text">Handspite Lab</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">Call & Response</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <NavLink to="/studio" className="hover:text-foreground text-primary font-medium">Gesture Studio →</NavLink>
            <span className="font-mono w-14 text-right">{live ? snap.fps : 0} FPS</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex min-h-0 p-4 gap-4">
        <div className="flex-1 min-w-0 glass-panel p-4">
          <HandArena isActive={cameraActive} onActiveChange={setCameraActive} onSnapshot={onSnapshot} />
        </div>

        <div className="w-64 flex-shrink-0 glass-panel p-4 overflow-y-auto text-xs space-y-5">
          <section>
            <div className="text-muted-foreground mb-1">Reading</div>
            <div className="font-mono text-lg text-primary">{committedLabel ?? (live && snap.geometry ? '…' : 'NONE')}</div>
            <div className="font-mono text-[10px] mt-1" style={{ color: `rgb(${MOOD_RGB[moodTop].join(',')})` }}>
              mood: {moodTop}
            </div>
          </section>

          <section className="border-t border-border pt-4">
            <div className="text-muted-foreground mb-2">Gesture graph</div>
            <div className="space-y-1.5 font-mono text-[10px]">
              {DEFAULT_GRAPH.map(n => {
                const s = live ? snap.resolution?.nodes.find(x => x.id === n.id) : undefined;
                const rgb = MOOD_RGB[n.response.mood].join(',');
                return (
                  <div key={n.id} className="flex items-center gap-2" style={{ paddingLeft: (DEPTH.get(n.id) ?? 0) * 10 }}>
                    <span className="w-20 truncate">{n.label}</span>
                    <div className="flex-1 flex flex-col gap-0.5">
                      <Bar value={s?.score ?? 0} color={`rgb(${rgb})`} dim />
                      <Bar value={s?.weight ?? 0} color={`rgb(${rgb})`} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">Top bar: match. Bottom: share of the response.</div>
          </section>

          <section className="border-t border-border pt-4">
            <div className="text-muted-foreground mb-2">Your fingers / app fingers</div>
            <div className="space-y-1.5 font-mono text-[10px]">
              {FINGERS.map(k => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-12 capitalize">{k}</span>
                  <div className="flex-1 flex flex-col gap-0.5">
                    <Bar value={live && snap.geometry ? snap.geometry.fingers[k] : 0} />
                    <Bar value={live ? snap.app.fingers[k] : 0} color={`rgb(${MOOD_RGB[moodTop].join(',')})`} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="flex-shrink-0 px-6 py-2 border-t border-border/50 text-xs text-muted-foreground text-center">
        Change your hand and watch it answer | 👍→👍 | 👋→👋 | ✌️→✌️ | ✊→🖕
      </footer>
    </div>
  );
};

export default Index;
