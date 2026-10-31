import { motion } from "motion/react";
import { type StarNode, type NodeStatus } from "../data";
import { useStudyStore } from "../store";
import { Lock, Check } from "lucide-react";

const COLORS: Record<NodeStatus, string> = {
  locked: "rgba(120,128,170,0.5)",
  unlocked: "var(--star-cyan)",
  weakness: "var(--star-pink)",
  mastered: "var(--star-glow)",
};

const SIZE: Record<NodeStatus, number> = {
  locked: 34,
  unlocked: 44,
  weakness: 66,
  mastered: 48,
};

export function ConstellationMap({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const constellation = useStudyStore((state) => state.constellation);

  function nodeById(id: string) {
    return constellation.find((n) => n.id === id)!;
  }

  return (
    <div className="relative h-full w-full">
      {/* star tracks */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {constellation.flatMap((n) =>
          n.deps.map((d) => {
            const from = nodeById(d);
            if (!from) return null;
            const active = n.status !== "locked";
            const mx = (from.x + n.x) / 2;
            return (
              <motion.path
                key={`${d}-${n.id}`}
                d={`M ${from.x} ${from.y} Q ${mx} ${(from.y + n.y) / 2 - 8} ${n.x} ${n.y}`}
                fill="none"
                stroke={active ? "var(--star-glow)" : "rgba(140,150,220,0.18)"}
                strokeWidth={0.35}
                strokeDasharray="1.4 1.6"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: active ? 0.7 : 0.3 }}
                transition={{ duration: 1.4, delay: 0.2 }}
              />
            );
          })
        )}
      </svg>

      {/* nodes */}
      {constellation.map((n, i) => (
        <StarNodeView
          key={n.id}
          node={n}
          index={i}
          selected={selected === n.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function StarNodeView({
  node,
  index,
  selected,
  onSelect,
}: {
  node: StarNode;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const isCourse = node.type === 'course';
  const isModule = node.type === 'module';
  const color = isCourse ? '#b084f5' : isModule ? '#f2c879' : COLORS[node.status];
  const baseSize = SIZE[node.status];
  const size = isCourse ? baseSize * 2.5 : isModule ? baseSize * 1.5 : baseSize;
  const locked = node.status === "locked";
  const weakness = node.status === "weakness";

  return (
    <motion.button
      type="button"
      onClick={() => !locked && onSelect(node.id)}
      className="group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none"
      style={{ left: `${node.x}%`, top: `${node.y}%`, cursor: locked ? "not-allowed" : "pointer" }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 180, damping: 14 }}
      whileHover={locked ? {} : { scale: 1.12 }}
    >
      {/* breathing halo */}
      <motion.span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: size * 2.4, height: size * 2.4, background: `radial-gradient(circle, ${color}, transparent 60%)` }}
        animate={{ opacity: locked ? 0.08 : weakness ? [0.35, 0.6, 0.35] : isCourse ? [0.4, 0.7, 0.4] : isModule ? [0.25, 0.45, 0.25] : [0.18, 0.34, 0.18], scale: weakness || isModule || isCourse ? [1, 1.18, 1] : [1, 1.08, 1] }}
        transition={{ duration: weakness ? 2.2 : isCourse ? 4.5 : isModule ? 3.5 : 4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* core orb */}
      <span
        className="relative flex items-center justify-center rounded-full border"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 35% 30%, ${color}, rgba(10,12,26,0.9))`,
          borderColor: selected ? "#fff" : color,
          boxShadow: `0 0 ${selected ? 28 : 16}px ${color}, inset 0 0 12px rgba(255,255,255,0.25)`,
        }}
      >
        {locked && <Lock className="h-3.5 w-3.5 text-white/60" />}
        {node.status === "mastered" && <Check className="h-4 w-4 text-white/90" />}
        {weakness && <span className="font-mono text-[10px] font-semibold text-white">{node.mastery}%</span>}
      </span>
      {/* label */}
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-center"
        style={{ textShadow: "0 1px 6px rgba(0,0,0,0.85)" }}
      >
        <span className="block text-[13px] font-medium text-[#eef1ff]" style={{ fontFamily: "var(--font-display)" }}>
          {node.title}
        </span>
        <span className="block font-mono text-[9px] uppercase tracking-wider text-[#9aa0c8]">{node.subtitle}</span>
      </span>
    </motion.button>
  );
}
