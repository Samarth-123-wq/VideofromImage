import { useEffect, useRef } from "react";

export default function FilmGrain({ opacity = 0.22 }: { opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const w = 160;
    const h = 284;
    canvas.width = w;
    canvas.height = h;

    let raf = 0;
    let last = 0;

    const draw = (t: number) => {
      if (t - last > 70) {
        last = t;
        const img = ctx.createImageData(w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = 90 + Math.random() * 140;
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
          d[i + 3] = 40 + Math.random() * 50;
        }
        ctx.putImageData(img, 0, 0);
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 h-full w-full mix-blend-overlay"
      style={{ opacity }}
    />
  );
}
