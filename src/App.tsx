import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DustMotes from "./components/DustMotes";
import FilmGrain from "./components/FilmGrain";
import SceneLayer from "./components/SceneLayer";
import { exportReel } from "./reel/exportReel";
import { SCENES, sceneTimings, scenesFromSrcs, type Scene } from "./reel/scenes";
import {
  getGoogleClientId,
  preloadGis,
  requestYoutubeToken,
  uploadToYoutube,
} from "./reel/youtube";

function useReelClock(token: number, scenes: Scene[]) {
  const [index, setIndex] = useState(0);
  const [flash, setFlash] = useState(0);
  const [ending, setEnding] = useState(false);
  const { starts, loopMs, pictureEnd } = useMemo(() => sceneTimings(scenes), [scenes]);

  useEffect(() => {
    setIndex(0);
    setEnding(false);
    setFlash((f) => f + 1);
    if (!scenes.length) return;

    let raf = 0;
    const start = performance.now();
    let lastIdx = 0;
    let lastEnding = false;

    const tick = (now: number) => {
      const t = (now - start) % loopMs;

      let next = 0;
      for (let i = starts.length - 1; i >= 0; i--) {
        if (t >= starts[i]) {
          next = i;
          break;
        }
      }

      if (next !== lastIdx) {
        lastIdx = next;
        setIndex(next);
        setFlash((f) => f + 1);
      }

      const isEnding = t > pictureEnd - 260;
      if (isEnding !== lastEnding) {
        lastEnding = isEnding;
        setEnding(isEnding);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [token, scenes, starts, loopMs, pictureEnd]);

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

const FRAME_COUNT = 12;

const ANGLES = [
  "wide establishing shot of this exact subject",
  "medium shot of this exact subject, cinematic composition",
  "close-up of this exact subject, shallow depth of field",
  "eye-level documentary still of this exact subject",
  "slightly over-the-shoulder view of this exact subject",
  "quiet moment with this exact subject, warm practical lights",
  "dynamic moment of this exact subject in action",
  "hands and objects that belong to this exact subject",
  "silhouette of this exact subject against the sky",
  "candid portrait of this exact subject, film grain",
  "dusk atmosphere with this exact subject, long shadows",
  "final wide shot of this exact subject, lingering mood",
];

type FrameProg = {
  n: number;
  src?: string;
  file?: string;
  provider?: string;
  error?: string;
  working?: boolean;
};

type KeyStatus = {
  gemini?: boolean;
  huggingface?: boolean;
  pollinations?: boolean;
  youtube?: boolean;
};

function pipelineLabel(s: KeyStatus | null) {
  const names: string[] = [];
  if (s?.pollinations) names.push("Pollinations");
  if (s?.huggingface) names.push("Hugging Face");
  if (s?.gemini) names.push("Gemini");
  if (!names.length) names.push("Pollinations");
  return names.join(" → ");
}

const btn =
  "rounded-md bg-[#2a160c] px-3 py-2 text-xs tracking-wide text-[#f3d7b0] ring-1 ring-[#e8b57a]/30 hover:bg-[#3a2010] disabled:opacity-40";

export default function App() {
  const [scenes, setScenes] = useState<Scene[]>(SCENES);
  const [token, setToken] = useState(0);
  const [topic, setTopic] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<KeyStatus | null>(null);
  const [frames, setFrames] = useState<FrameProg[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { index, flash, ending } = useReelClock(token, scenes);
  const scene = scenes[index];

  const restart = useCallback(() => setToken((t) => t + 1), []);

  useEffect(() => {
    preloadGis();
  }, []);

  useEffect(() => {
    void fetch("/api/status")
      .then((r) => r.json())
      .then((s: KeyStatus) => {
        setKeys(s);
        if (!s.pollinations && !s.huggingface && !s.gemini) {
          setStatus("AI pipeline: none. Add POLLINATIONS_API_KEY, HF_TOKEN, or GEMINI_API_KEY to .env.");
        } else if (!s.youtube) {
          setStatus(`AI: ${pipelineLabel(s)}. Add VITE_GOOGLE_CLIENT_ID for YouTube.`);
        } else {
          setStatus(`AI: ${pipelineLabel(s)}. Topic → Generate → Add audio → Publish.`);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not read API status"));
  }, []);

  useEffect(() => {
    scenes.forEach((s) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = s.src;
    });
  }, [scenes]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }, [token, audioUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
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

  const onAudio = (file: File | undefined) => {
    if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setStatus(`Audio ready: ${file.name}`);
  };

  const deleteAll = async () => {
    setBusy(true);
    setError("");
    setStatus("Deleting public/images…");
    try {
      const r = await fetch("/api/clear-images", { method: "POST" });
      const data = (await r.json()) as { deleted?: number; error?: string };
      if (!r.ok) throw new Error(data.error || "Delete failed");
      setScenes([]);
      setFrames([]);
      setToken((t) => t + 1);
      setStatus(`Deleted ${data.deleted ?? 0} files from public/images`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    const name = topic.trim();
    if (!name) {
      setError("Enter a topic name");
      return;
    }
    setBusy(true);
    setError("");
    setFrames(Array.from({ length: FRAME_COUNT }, (_, i) => ({ n: i + 1 })));
    setScenes([]);
    const stamp = Date.now();
    const pipe = pipelineLabel(keys);
    const urls: string[] = [];
    let lastProvider = "";
    let lastError = "";
    try {
      for (let i = 0; i < FRAME_COUNT; i++) {
        setFrames((prev) =>
          prev.map((f) => (f.n === i + 1 ? { ...f, working: true, error: undefined } : { ...f, working: false })),
        );
        setStatus(`Frame ${i + 1}/${FRAME_COUNT} · trying ${pipe}`);
        const promptAngle = ANGLES[i];
        let saved: { src: string; file: string; provider: string } | null = null;
        lastError = "Image generation failed";
        for (let attempt = 0; attempt < 2 && !saved; attempt++) {
          try {
            const r = await fetch("/ai-frame", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic: name,
                angle: promptAngle,
                seed: String(stamp + i + attempt * 17),
                index: i + 1,
              }),
            });
            const data = (await r.json()) as {
              src?: string;
              file?: string;
              provider?: string;
              warnings?: string[];
              error?: string;
            };
            if (!r.ok || !data.src) throw new Error(data.error || "generate fail");
            saved = {
              src: `${data.src}?t=${Date.now()}`,
              file: data.file || "",
              provider: data.provider || "AI",
            };
            if (data.warnings?.length) setError(data.warnings.join(" | "));
          } catch (e) {
            lastError = e instanceof Error ? e.message : lastError;
          }
        }
        if (!saved) {
          setFrames((prev) =>
            prev.map((f) => (f.n === i + 1 ? { ...f, working: false, error: lastError } : f)),
          );
          setError(`Frame ${i + 1} failed: ${lastError}`);
          continue;
        }
        lastProvider = saved.provider;
        urls.push(saved.src);
        const done = saved;
        setFrames((prev) =>
          prev.map((f) =>
            f.n === i + 1
              ? { n: f.n, src: done.src, file: done.file, provider: done.provider, working: false }
              : f,
          ),
        );
        setScenes(scenesFromSrcs(urls));
        setToken((t) => t + 1);
        setStatus(`Saved ${done.file} via ${done.provider} (${urls.length}/${FRAME_COUNT})`);
      }
      if (urls.length < 10) throw new Error(lastError || `Only ${urls.length} images generated`);
      setStatus(`Done · ${urls.length} images in public/images · ${lastProvider}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate images");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!scenes.length) {
      setStatus("No images to publish");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const clientId = getGoogleClientId();
      let tokenYt = "";
      if (clientId) {
        setStatus("Sign in with Google to upload…");
        tokenYt = await requestYoutubeToken(clientId);
      }
      setStatus("Merging images and audio into video…");
      const blob = await exportReel(scenes, audioUrl);
      if (!clientId) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${(topic || "reel").replace(/\s+/g, "-")}.webm`;
        a.click();
        setStatus("Set VITE_GOOGLE_CLIENT_ID in .env to upload. Video downloaded for now.");
        setBusy(false);
        return;
      }
      setStatus("Uploading to YouTube…");
      const url = await uploadToYoutube(blob, tokenYt, topic.trim() || "Cinematic reel");
      setStatus(`Published: ${url}`);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
      setStatus("Publish failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-[#0a0603] select-none">
      <img
        src={scenes[0]?.src || "/images/scene-10-sunset.jpg"}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.22] blur-3xl"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,18,6,0.15),rgba(6,3,1,0.88))]" />

      <section
        className="theater-glow relative z-10 cursor-pointer overflow-hidden bg-black"
        style={frameStyle}
        aria-label="Cinematic stills reel"
        onClick={restart}
      >
        <div className="reel-flicker reel-weave absolute inset-0">
          {scenes.map((s, i) => (
            <SceneLayer key={s.id} scene={s} active={i === index} />
          ))}
        </div>

        {!scenes.length && (
          <p className="absolute inset-0 z-30 flex items-center justify-center px-8 text-center text-sm text-[#f3d7b0]/70">
            Images deleted. Enter a topic and generate, or refresh to restore the default reel.
          </p>
        )}

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

      {audioUrl && <audio ref={audioRef} src={audioUrl} loop className="hidden" />}

      <div
        className="absolute bottom-3 left-1/2 z-[80] flex w-[min(96vw,48rem)] -translate-x-1/2 flex-col gap-2 rounded-xl bg-black/75 p-3 ring-1 ring-[#e8b57a]/25"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void generate();
            }}
            placeholder="Topic name for AI photos"
            className="min-w-[12rem] flex-1 rounded-md bg-[#140a06] px-3 py-2 text-sm text-[#f3d7b0] outline-none ring-1 ring-[#e8b57a]/25"
          />
          <button type="button" className={btn} disabled={busy} onClick={() => void generate()}>
            Generate
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => fileRef.current?.click()}>
            Add audio
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => void deleteAll()}>
            Delete
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => void publish()}>
            Publish
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => onAudio(e.target.files?.[0])}
          />
        </div>
        <p className="text-[11px] leading-snug text-[#e8b57a]/90">
          {status || `AI: ${pipelineLabel(keys)}`}
        </p>
        {error && <p className="text-[11px] leading-snug text-red-400">{error}</p>}
        {frames.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pt-1">
            {frames.map((f) => (
              <div key={f.n} className="w-11 shrink-0">
                <div
                  className={`relative h-16 w-11 overflow-hidden rounded bg-[#140a06] ring-1 ${
                    f.error
                      ? "ring-red-500/70"
                      : f.working
                        ? "ring-[#e8b57a]"
                        : "ring-[#e8b57a]/25"
                  }`}
                >
                  {f.src ? (
                    <img src={f.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[#f3d7b0]/70">
                      {f.working ? "…" : f.n}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-center text-[8px] text-[#e8b57a]/80">
                  {f.error ? "error" : f.provider || (f.working ? "AI" : "")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
