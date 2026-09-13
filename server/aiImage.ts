export type EnvMap = Record<string, string>;

export function framePrompt(topic: string, angle: string) {
  const subject = topic.trim();
  return [
    `Photorealistic photograph of ${subject}.`,
    `The main subject of this picture must be ${subject}.`,
    `Do not replace the subject with a generic street, sunset, or unrelated people.`,
    `Camera: ${angle}.`,
    `Cinematic 35mm film still, natural lighting, no text, no watermark, no logo.`,
  ].join(" ");
}

export function keyStatus(env: EnvMap) {
  return {
    gemini: Boolean(env.GEMINI_API_KEY?.trim()),
    huggingface: Boolean(env.HF_TOKEN?.trim()),
    pollinations: Boolean(env.POLLINATIONS_API_KEY?.trim()),
    youtube: Boolean(env.VITE_GOOGLE_CLIENT_ID?.trim()),
  };
}

type Img = { mime: string; buf: Buffer; provider: string };

function fromB64(data: string, mime = "image/png"): Img {
  const clean = data.replace(/^data:image\/\w+;base64,/, "");
  return { mime, buf: Buffer.from(clean, "base64"), provider: "" };
}

async function fromUrl(url: string): Promise<Img> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`image url ${r.status}`);
  return {
    mime: r.headers.get("content-type") || "image/jpeg",
    buf: Buffer.from(await r.arrayBuffer()),
    provider: "",
  };
}

function pickOpenAiImage(json: unknown): { b64?: string; url?: string } | null {
  const data = (json as { data?: { b64_json?: string; url?: string }[] })?.data?.[0];
  if (!data) return null;
  return { b64: data.b64_json, url: data.url };
}

async function fromGemini(prompt: string, env: EnvMap): Promise<Img> {
  const key = env.GEMINI_API_KEY.trim();
  const model = env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    },
  );
  const text = await r.text();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${text.slice(0, 180)}`);
  const json = JSON.parse(text) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Gemini returned no image");
  return {
    mime: part.inlineData.mimeType || "image/png",
    buf: Buffer.from(part.inlineData.data, "base64"),
    provider: "Gemini",
  };
}

async function fromHf(prompt: string, env: EnvMap): Promise<Img> {
  const token = env.HF_TOKEN.trim();
  const model = env.HF_IMAGE_MODEL?.trim() || "black-forest-labs/FLUX.1-schnell";
  const fullPrompt = prompt;
  const errors: string[] = [];

  const tryJson = async (url: string, body: unknown) => {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const ctype = r.headers.get("content-type") || "";
    if (!r.ok) throw new Error(`${r.status}: ${buf.toString("utf8").slice(0, 160)}`);
    if (ctype.startsWith("image/")) return { mime: ctype, buf, provider: "Hugging Face" };
    const json = JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
    const open = pickOpenAiImage(json);
    if (open?.b64) return { ...fromB64(open.b64), provider: "Hugging Face" };
    if (open?.url) return { ...(await fromUrl(open.url)), provider: "Hugging Face" };
    const falUrl = (json as { images?: { url?: string }[] }).images?.[0]?.url;
    if (typeof falUrl === "string") return { ...(await fromUrl(falUrl)), provider: "Hugging Face" };
    throw new Error("Hugging Face returned no image");
  };

  try {
    return await tryJson("https://router.huggingface.co/v1/images/generations", {
      model,
      prompt: fullPrompt,
      n: 1,
      size: "1024x1024",
    });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "v1 failed");
  }

  try {
    return await tryJson("https://router.huggingface.co/fal-ai/fal-ai/flux/schnell", {
      prompt: fullPrompt,
      image_size: "portrait_4_3",
      num_inference_steps: 4,
    });
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "fal failed");
  }

  throw new Error(`Hugging Face ${errors.join(" | ")}`);
}

async function fromPollinations(prompt: string, env: EnvMap, seed: string): Promise<Img> {
  const token = env.POLLINATIONS_API_KEY?.trim();
  const fullPrompt = prompt;

  if (token) {
    const r = await fetch("https://gen.pollinations.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        model: "flux",
        size: "768x1280",
        response_format: "b64_json",
      }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Pollinations ${r.status}: ${text.slice(0, 180)}`);
    const json = JSON.parse(text) as unknown;
    const open = pickOpenAiImage(json);
    if (open?.b64) return { ...fromB64(open.b64, "image/jpeg"), provider: "Pollinations" };
    if (open?.url) return { ...(await fromUrl(open.url)), provider: "Pollinations" };
    throw new Error("Pollinations returned no image");
  }

  const q = new URLSearchParams({
    width: "768",
    height: "1280",
    nologo: "true",
    seed,
    model: "flux",
  });
  const dest = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?${q}`;
  const r = await fetch(dest, { headers: { Accept: "image/*" } });
  if (!r.ok) throw new Error(`Pollinations ${r.status}`);
  const ctype = r.headers.get("content-type") || "";
  if (!ctype.startsWith("image/")) throw new Error(`Pollinations ${r.status}: not an image`);
  return {
    mime: ctype || "image/jpeg",
    buf: Buffer.from(await r.arrayBuffer()),
    provider: "Pollinations",
  };
}

export async function generateImage(prompt: string, env: EnvMap, seed = "1") {
  const warnings: string[] = [];
  const steps: Array<{ name: string; run: () => Promise<Img> }> = [];

  if (env.POLLINATIONS_API_KEY?.trim()) {
    steps.push({ name: "Pollinations", run: () => fromPollinations(prompt, env, seed) });
  }
  if (env.HF_TOKEN?.trim()) {
    steps.push({ name: "Hugging Face", run: () => fromHf(prompt, env) });
  }
  if (env.GEMINI_API_KEY?.trim()) {
    steps.push({ name: "Gemini", run: () => fromGemini(prompt, env) });
  }
  if (!env.POLLINATIONS_API_KEY?.trim()) {
    steps.push({ name: "Pollinations", run: () => fromPollinations(prompt, env, seed) });
  }

  for (const step of steps) {
    try {
      return { ...(await step.run()), warnings };
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : `${step.name} failed`);
    }
  }
  throw new Error(warnings.join(" | ") || "No image provider worked");
}



