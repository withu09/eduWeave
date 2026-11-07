import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Radar as RadarIcon, X } from "lucide-react";
import { ProfileRadar } from "./ProfileRadar";

// Collapsible six-dimension profile module — a pill that expands on click.
export function RadarModule() {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute bottom-4 right-4 z-30">
      <AnimatePresence mode="wait">
        {open ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="w-[300px]"
          >
            <div className="relative">
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-lg p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <ProfileRadar />
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="pill"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 rounded-full border border-border bg-card/80 py-2 pl-2 pr-3.5 backdrop-blur-xl transition hover:border-[var(--star-glow)]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, var(--star-glow), var(--star-cyan))" }}>
              <RadarIcon className="h-4 w-4 text-white" />
            </span>
            <span className="text-[12px]">学习概况</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
