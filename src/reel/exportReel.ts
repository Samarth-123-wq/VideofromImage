import type { Scene } from "./scenes";

function pickMime() {
  const opts = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ];
  return opts.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scale: number,
  xPct: number,
  yPct: number,
) {
  const { width: cw, height: ch } = ctx.canvas;
  const ir = img.width / img.height;
  const cr = cw / ch;
  let dw = cw;
  let dh = ch;
  if (ir > cr) {
    dh = ch;
    dw = ch * ir;
  } else {
    dw = cw;
    dh = cw / ir;
  }
  dw *= scale;
  dh *= scale;
  const x = (cw - dw) / 2 + (xPct / 100) * cw * 0.25;
  const y = (ch - dh) / 2 + (yPct / 100) * ch * 0.25;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, x, y, dw, dh);
}

export async function exportReel(
  scenes: Scene[],
  audioUrl: string | null,
): Promise<Blob> {
  if (!scenes.length) throw new Error("No images to export");

  const width = 720;
  const height = 1280;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const images = await Promise.all(scenes.map((s) => loadImage(s.src)));
  const durationMs = scenes.reduce((a, s) => a + s.hold, 0);
  const fps = 30;

  const canvasStream = canvas.captureStream(fps);
  const mixed = new MediaStream(canvasStream.getVideoTracks());

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  if (audioUrl) {
    const buf = await fetch(audioUrl).then((r) => r.arrayBuffer());
    const decoded = await audioCtx.decodeAudioData(buf);
    const src = audioCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(dest);
    src.start(0);
  }
  dest.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));

  const mime = pickMime();
  const recorder = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Recording failed"));
    recorder.onstop = () => {
      void audioCtx.close();
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    };
  });

  recorder.start(200);

  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = now - t0;
      if (t >= durationMs) {
        coverDraw(
          ctx,
          images[images.length - 1],
          scenes[scenes.length - 1].to.scale,
          scenes[scenes.length - 1].to.x,
          scenes[scenes.length - 1].to.y,
        );
        resolve();
        return;
      }
      let acc = 0;
      let idx = 0;
      let local = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (t < acc + scenes[i].hold) {
          idx = i;
          local = (t - acc) / scenes[i].hold;
          break;
        }
        acc += scenes[i].hold;
        idx = i;
        local = 1;
      }
      const s = scenes[idx];
      const k = {
        scale: s.from.scale + (s.to.scale - s.from.scale) * local,
        x: s.from.x + (s.to.x - s.from.x) * local,
        y: s.from.y + (s.to.y - s.from.y) * local,
      };
      coverDraw(ctx, images[idx], k.scale, k.x, k.y);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await new Promise((r) => setTimeout(r, 80));
  recorder.stop();
  return done;
}
