import { useCallback, useEffect, useMemo, useState } from "react";
import DustMotes from "./components/DustMotes";
import FilmGrain from "./components/FilmGrain";
import SceneLayer from "./components/SceneLayer";
import { LOOP_MS, SCENES, SCENE_STARTS } from "./reel/scenes";

const PICTURE_END =
  SCENE_STARTS[SCENE_STARTS.length - 1] + SCENES[SCENES.length - 1].hold;

function useReelClock(token: number) {
  const [index, setIndex] = useState(0);
  const [flash, setFlash] = useState(0);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    setIndex(0);
    setEnding(false);
    setFlash((f) => f + 1);

    let raf = 0;
    const start = performance.now();
    let lastIdx = 0;
    let lastEnding = false;

    const tick = (now: number) => {
      const t = (now - start) % LOOP_MS;

      let next = 0;
      for (let i = SCENE_STARTS.length - 1; i >= 0; i--) {
        if (t >= SCENE_STARTS[i]) {
          next = i;
          break;
        }
      }

      if (next !== lastIdx) {
        lastIdx = next;
        setIndex(next);
        setFlash((f) => f + 1);
      }

      const isEnding = t > PICTURE_END - 260;
      if (isEnding !== lastEnding) {
        lastEnding = isEnding;
        setEnding(isEnding);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [token]);

  return { index, flash, ending };
}

function LightLeak() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      <div
        className="light-leak absolute -right-[20%] -top-[18%] h-[55%] w-[70%] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,170,70,0.55) 0%, rgba(255,110,20,0.12) 42%, transparent 70%)",
        }}
      />
      <div
        className="light-leak absolute -left-[18%] bottom-[-10%] h-[40%] w-[55%] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(255,90,30,0.22) 0%, transparent 70%)",
          animationDelay: "-3.2s",
        }}
      />
    </div>
  );
}

function CrtOverlay({ on }: { on: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[25]"
      style={{
        opacity: on ? 1 : 0,
        transition: "opacity 280ms ease",
      }}
      aria-hidden
    >
      <div className="scanlines absolute inset-0 opacity-70 mix-blend-multiply" />
      <div
        className="crt-scan absolute left-0 right-0 h-[18%] opacity-30"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(180,255,200,0.12), transparent)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ boxShadow: "inset 0 0 80px 20px rgba(0,0,0,0.35)" }}
      />
    </div>
  );
}

function SpliceFlash({ token }: { token: number }) {
  const [vis, setVis] = useState(false);

  useEffect(() => {
    if (token === 0) return;
    setVis(true);
    const t = window.setTimeout(() => setVis(false), 90);
    return () => window.clearTimeout(t);
  }, [token]);

  if (!vis) return null;

  return (
    <div
      className="splice pointer-events-none absolute inset-0 z-40"
      style={{
        background:
          "linear-gradient(90deg, rgba(255,230,180,0.0), rgba(255,220,160,0.5) 46%, rgba(255,180,80,0.18))",
      }}
      aria-hidden
    />
  );
}

export default function App() {
  const [token, setToken] = useState(0);
  const { index, flash, ending } = useReelClock(token);
  const scene = SCENES[index];

  const restart = useCallback(() => setToken((t) => t + 1), []);

  useEffect(() => {
    SCENES.forEach((s) => {
      const img = new Image();
      img.src = s.src;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "r" || e.key === "R") {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restart]);

  const frameStyle = useMemo(
    () => ({
      width: "min(100vw, calc(100dvh * 9 / 16))",
      height: "min(100dvh, calc(100vw * 16 / 9))",
    }),
    [],
  );

  return (
    <main
      className="relative flex min-h-[100dvh] w-full cursor-pointer items-center justify-center overflow-hidden bg-[#0a0603] select-none"
      onClick={restart}
    >
      <img
        src="/images/scene-10-sunset.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.22] blur-3xl"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,18,6,0.15),rgba(6,3,1,0.88))]" />

      <section
        className="theater-glow relative z-10 overflow-hidden bg-black"
        style={frameStyle}
        aria-label="Silent cinematic reel of 1990s Indian street cricket"
      >
        <div className="reel-flicker reel-weave absolute inset-0">
          {SCENES.map((s, i) => (
            <SceneLayer key={s.id} scene={s} active={i === index} />
          ))}
        </div>

        <div className="warm-grade pointer-events-none absolute inset-0 z-10" />
        <div className="vignette pointer-events-none absolute inset-0 z-20" />
        <LightLeak />
        <DustMotes />
        <CrtOverlay on={!!scene?.flicker} />
        <FilmGrain opacity={0.2} />
        <SpliceFlash token={flash} />

        <div
          className="pointer-events-none absolute inset-0 z-50 bg-black"
          style={{
            opacity: ending ? 1 : 0,
            transition: "opacity 260ms ease-in",
          }}
        />
      </section>
    </main>
  );
}
