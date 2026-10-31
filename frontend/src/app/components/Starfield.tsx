import { useEffect, useRef } from "react";

// Animated cosmic background: drifting starfield + nebula glow on raw canvas.
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const stars: { x: number; y: number; z: number; r: number; tw: number }[] = [];

    const resize = () => {
      w = canvas.width = canvas.offsetWidth * devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 220; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 0.8 + 0.2,
        r: Math.random() * 1.4 + 0.3,
        tw: Math.random() * Math.PI * 2,
      });
    }

    let t = 0;
    const draw = () => {
      t += 0.01;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.y += s.z * 0.12 * devicePixelRatio;
        if (s.y > h) s.y = 0;
        const alpha = 0.4 + Math.sin(t * 2 + s.tw) * 0.35;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * s.z * devicePixelRatio, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${180 + s.z * 40}, ${190}, 255, ${alpha * s.z})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* nebula glows */}
      <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full opacity-40 blur-[120px]" style={{ background: "radial-gradient(circle, var(--star-glow), transparent 65%)" }} />
      <div className="absolute -right-40 top-1/3 h-[34rem] w-[34rem] rounded-full opacity-30 blur-[120px]" style={{ background: "radial-gradient(circle, var(--star-pink), transparent 65%)" }} />
      <div className="absolute bottom-0 left-1/3 h-[28rem] w-[28rem] rounded-full opacity-20 blur-[120px]" style={{ background: "radial-gradient(circle, var(--star-cyan), transparent 65%)" }} />
      <canvas ref={ref} className="h-full w-full" />
    </div>
  );
}
