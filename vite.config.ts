import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type PreviewServer, type ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import { viteSingleFile } from "vite-plugin-singlefile";
import { framePrompt, generateImage, keyStatus } from "./server/aiImage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGES_DIR = path.resolve(__dirname, "public/images");

function extFor(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function json(
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: unknown) => void },
  code: number,
  body: unknown,
) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function aiPlugin(env: Record<string, string>) {
  const handle = async (
    req: IncomingMessage,
    res: {
      statusCode: number;
      setHeader: (k: string, v: string) => void;
      end: (b?: unknown) => void;
    },
    next: () => void,
  ) => {
    const url = req.url || "";
    if (req.method === "GET" && url.startsWith("/api/status")) {
      json(res, 200, keyStatus(env));
      return;
    }
    if ((req.method === "POST" || req.method === "GET") && url.startsWith("/api/clear-images")) {
      await fs.mkdir(IMAGES_DIR, { recursive: true });
      const names = await fs.readdir(IMAGES_DIR);
      let deleted = 0;
      for (const name of names) {
        const full = path.join(IMAGES_DIR, name);
        const st = await fs.stat(full);
        if (st.isFile()) {
          await fs.unlink(full);
          deleted += 1;
        }
      }
      json(res, 200, { deleted });
      return;
    }
    if ((req.method === "GET" || req.method === "POST") && url.startsWith("/ai-frame")) {
      const u = new URL(url, "http://local");
      let topic = u.searchParams.get("topic") || "";
      let angle = u.searchParams.get("angle") || "";
      let prompt = u.searchParams.get("p") || "";
      let seed = u.searchParams.get("seed") || "1";
      let index = Math.max(1, Number(u.searchParams.get("index") || "1") || 1);
      if (req.method === "POST") {
        try {
          const body = JSON.parse((await readBody(req)) || "{}") as {
            topic?: string;
            angle?: string;
            p?: string;
            prompt?: string;
            seed?: string | number;
            index?: number;
          };
          topic = body.topic || topic;
          angle = body.angle || angle;
          prompt = body.prompt || body.p || prompt;
          if (body.seed != null) seed = String(body.seed);
          if (body.index != null) index = Math.max(1, Number(body.index) || 1);
        } catch {
          json(res, 400, { error: "invalid json" });
          return;
        }
      }
      if (topic.trim()) prompt = framePrompt(topic, angle);
      if (!prompt) {
        json(res, 400, { error: "missing prompt" });
        return;
      }
      try {
        const { mime, buf, provider, warnings } = await generateImage(prompt, env, seed);
        await fs.mkdir(IMAGES_DIR, { recursive: true });
        const file = `frame-${String(index).padStart(2, "0")}.${extFor(mime)}`;
        await fs.writeFile(path.join(IMAGES_DIR, file), buf);
        json(res, 200, {
          src: `/images/${file}`,
          file,
          provider,
          warnings: warnings ?? [],
        });
      } catch (e) {
        json(res, 502, { error: e instanceof Error ? e.message : "generate fail" });
      }
      return;
    }
    next();
  };

  return {
    name: "ai-keys-and-frames",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        void handle(req, res, next);
      });
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        void handle(req, res, next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const coop = {
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };
  return {
    plugins: [react(), tailwindcss(), viteSingleFile(), aiPlugin(env)],
    server: { headers: coop },
    preview: { headers: coop },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
