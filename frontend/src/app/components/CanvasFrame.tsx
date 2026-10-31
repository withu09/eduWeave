import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Maximize2, Minimize2, Compass, Circle, Globe } from "lucide-react";
import { PannableCanvas } from "./PannableCanvas";
import { ConstellationMap } from "./ConstellationMap";
import { RadarModule } from "./RadarModule";
import { Starfield } from "./Starfield";
import { InlineBrowser } from "./InlineBrowser";
import { useStudyStore } from "../store";

export function CanvasFrame({
  selected,
  onSelect,
  children,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  children?: React.ReactNode;
}) {
  const [full, setFull] = useState(false);
  const [browser, setBrowser] = useState(false);
  const { currentScope, constellation } = useStudyStore();

  const scopeTitle = currentScope === 'all' 
    ? "宏观宇宙" 
    : constellation.find(n => n.id === currentScope)?.title || "专业课程";

  // Keyboard shortcut for Esc to exit full screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && full) {
        setFull(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [full]);

  return (
    <motion.div
      layout
      className={
        full
          ? "fixed inset-3 z-[90] flex flex-col overflow-hidden rounded-2xl border border-[rgba(140,150,220,0.18)] bg-[#070815]"
          : "relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[rgba(140,150,220,0.18)] bg-[#070815]"
      }
      style={{ boxShadow: "0 24px 80px -24px rgba(0,0,0,0.5)" }}
    >
      {/* frame chrome */}
      <div className="z-10 flex items-center justify-between border-b border-[rgba(140,150,220,0.18)] bg-[#0a0c1a]/80 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <Circle className="h-2.5 w-2.5 fill-[#ff6b6b] text-[#ff6b6b]" />
            <Circle className="h-2.5 w-2.5 fill-[#f2c879] text-[#f2c879]" />
            <Circle className="h-2.5 w-2.5 fill-[#7ce0b0] text-[#7ce0b0]" />
          </div>
          <div className="ml-2 flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-[#8b7dff]" />
            <span className="font-mono text-[11px] text-[#9aa0c8]">
              weave-canvas / {scopeTitle}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBrowser((b) => !b)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90"
            style={{ borderColor: "rgba(90,209,232,0.5)", background: "rgba(90,209,232,0.16)" }}
            title="资源推荐 · 课程专属"
          >
            <Globe className="h-3.5 w-3.5" /> 资源推荐
          </button>
          <button
            onClick={() => setFull((f) => !f)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90"
            style={{ borderColor: "rgba(139,125,255,0.5)", background: "rgba(139,125,255,0.18)" }}
            title={full ? "退出全屏 (Esc)" : "全屏模式"}
          >
            {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {full ? "退出全屏" : "全屏模式"}
          </button>
        </div>
      </div>

      {/* canvas viewport */}
      <div className="relative flex-1 overflow-hidden">
        <Starfield />
        <PannableCanvas>
          <ConstellationMap selected={selected} onSelect={onSelect} />
        </PannableCanvas>
        <RadarModule />
        {/* resource cards / overlays mount here */}
        {children}
        <AnimatePresence>
          {browser && <InlineBrowser onClose={() => setBrowser(false)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
