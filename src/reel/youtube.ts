export function getGoogleClientId() {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || "";
}

type GisWindow = {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (cfg: {
          client_id: string;
          scope: string;
          callback: (resp: {
            access_token?: string;
            expires_in?: number;
            error?: string;
          }) => void;
          error_callback?: (err: { type?: string; message?: string }) => void;
        }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
      };
    };
  };
};

function gisReady() {
  return Boolean((window as GisWindow).google?.accounts?.oauth2);
}

function loadGis(): Promise<void> {
  if (gisReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    const done = () => (gisReady() ? resolve() : reject(new Error("Google sign-in failed to load")));
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => reject(new Error("Google sign-in failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error("Google sign-in failed to load"));
    document.head.appendChild(s);
  });
}

export function preloadGis() {
  void loadGis();
}

let cached: { token: string; exp: number } | null = null;

export function requestYoutubeToken(clientId: string): Promise<string> {
  if (cached && Date.now() < cached.exp - 60_000) {
    return Promise.resolve(cached.token);
  }
  const oauth = (window as GisWindow).google?.accounts?.oauth2;
  if (!oauth) {
    return Promise.reject(
      new Error("Google sign-in is still loading. Wait a second, allow popups for this site, then click Publish again."),
    );
  }

  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/youtube.upload",
      callback: (resp) => {
        if (resp.access_token) {
          cached = {
            token: resp.access_token,
            exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
          };
          resolve(resp.access_token);
        } else {
          reject(new Error(resp.error || "YouTube sign-in cancelled"));
        }
      },
      error_callback: (err) => {
        const t = err?.type || "";
        if (t === "popup_failed_to_open") {
          reject(
            new Error(
              "Google sign-in popup was blocked. Allow popups for localhost, then click Publish again (the sign-in window must open immediately).",
            ),
          );
          return;
        }
        if (t === "popup_closed") {
          reject(new Error("Google sign-in was closed before finishing."));
          return;
        }
        reject(new Error(err?.message || t || "YouTube sign-in failed"));
      },
    });
    client.requestAccessToken();
  });
}

export async function uploadToYoutube(
  blob: Blob,
  accessToken: string,
  title: string,
) {
  const meta = {
    snippet: {
      title: title.slice(0, 90) || "Untitled reel",
      description: "Published from the cinematic reel studio.",
      categoryId: "22",
    },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  };

  const start = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": blob.type || "video/webm",
        "X-Upload-Content-Length": String(blob.size),
      },
      body: JSON.stringify(meta),
    },
  );

  if (!start.ok) {
    const text = await start.text();
    throw new Error(text || `YouTube init failed (${start.status})`);
  }

  const location = start.headers.get("Location");
  if (!location) throw new Error("YouTube did not return an upload URL");

  const put = await fetch(location, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": blob.type || "video/webm",
    },
    body: blob,
  });

  if (!put.ok) {
    const text = await put.text();
    throw new Error(text || `YouTube upload failed (${put.status})`);
  }

  const json = (await put.json()) as { id?: string };
  if (!json.id) throw new Error("YouTube upload returned no video id");
  return `https://www.youtube.com/watch?v=${json.id}`;
}
