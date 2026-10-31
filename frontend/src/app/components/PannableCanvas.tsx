import { useRef, useState, type ReactNode } from "react";
import { Plus, Minus, Locate } from "lucide-react";

// Infinite-canvas pan + zoom wrapper for the Weave Canvas.
export function PannableCanvas({ children }: { children: ReactNode }) {
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [scale, setScale] = useState(1);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const onDown = (e: React.MouseEvent) => {
    // ignore clicks that start on interactive nodes (buttons)
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
    setGrabbing(true);
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };
  const onUp = () => {
    drag.current = null;
    setGrabbing(false);
  };
  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(2, Math.max(0.5, scale - e.deltaY * 0.0012));
    setScale(next);
  };
  const reset = () => {
    setTx(0);
    setTy(0);
    setScale(1);
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ cursor: grabbing ? "grabbing" : "grab" }}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onWheel={onWheel}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: 1500,
          height: 920,
          transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: drag.current ? "none" : "transform 0.12s ease-out",
        }}
      >
        {children}
      </div>

      {/* zoom controls */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5">
        <ZoomBtn onClick={() => setScale((s) => Math.min(2, s + 0.15))}><Plus className="h-4 w-4" /></ZoomBtn>
        <ZoomBtn onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}><Minus className="h-4 w-4" /></ZoomBtn>
        <ZoomBtn onClick={reset}><Locate className="h-4 w-4" /></ZoomBtn>
      </div>
      <div className="absolute bottom-4 left-16 z-20 rounded-md border border-border bg-card/70 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-md">
        {Math.round(scale * 100)}% · 拖拽平移 · 滚轮缩放
      </div>
    </div>
  );
}

function ZoomBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card/70 text-foreground/80 backdrop-blur-md transition hover:border-[var(--star-glow)] hover:text-foreground"
    >
      {children}
    </button>
  );
}
