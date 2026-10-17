export type PostResult =
  | { ok: true; status: number; bodyText: string }
  | { ok: false; kind: "network" | "http" | "timeout"; status?: number; bodyText?: string; error?: string };

export interface PostOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function postJson(url: string, body: unknown, opts: PostOptions = {}): Promise<PostResult> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text().catch(() => "");
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, bodyText: text };
    }
    return { ok: false, kind: "http", status: res.status, bodyText: text };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (controller.signal.aborted) {
      return { ok: false, kind: "timeout", error: msg };
    }
    return { ok: false, kind: "network", error: msg };
  }
}