import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { LiteratureDownloadError } from "./arxiv";

export interface UnpaywallOaResult {
  url: string | null;
  host_type: string | null;
  license: string | null;
  version: string | null;
}

let unpaywallRequestTail: Promise<void> = Promise.resolve();

async function withSingleUnpaywallRequest<T>(fn: () => Promise<T>): Promise<T> {
  const prior = unpaywallRequestTail;
  let release: () => void = () => undefined;
  unpaywallRequestTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prior.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

function requireUnpaywallEmail(email: string): string {
  const value = String(email || "").trim();
  if (!value) {
    throw new LiteratureDownloadError(
      ConsumerErrorCodes.INVALID_ARGS,
      "unpaywall_email is required for Unpaywall API requests"
    );
  }
  return value;
}

function nullUnpaywallResult(): UnpaywallOaResult {
  return { url: null, host_type: null, license: null, version: null };
}

function normalizeString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function abortSignalWithTimeout(timeoutMs: number, signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, Math.max(1, timeoutMs));
  const onAbort = () => {
    controller.abort();
  };
  signal?.addEventListener?.("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener?.("abort", onAbort);
    }
  };
}

export async function resolveUnpaywallOaPdf(
  doi: string,
  email: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<UnpaywallOaResult> {
  const normalizedDoi = String(doi || "").trim().replace(/^doi:/i, "");
  if (!/^10\.\S+\/\S+$/i.test(normalizedDoi)) {
    throw new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, "A valid DOI is required for Unpaywall lookup");
  }
  const normalizedEmail = requireUnpaywallEmail(email);
  const endpoint = new URL(`https://api.unpaywall.org/v2/${encodeURIComponent(normalizedDoi)}`);
  endpoint.searchParams.set("email", normalizedEmail);

  return withSingleUnpaywallRequest(async () => {
    const { signal, cleanup } = abortSignalWithTimeout(opts.timeoutMs || 15000, opts.signal);
    let response: Response;
    try {
      response = await fetch(endpoint.toString(), {
        method: "GET",
        redirect: "follow",
        signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": "web-ai-capability-hub-unpaywall/2.2.0"
        }
      });
    } catch (error) {
      throw new LiteratureDownloadError(
        "NETWORK_ERROR",
        `Unpaywall request failed: ${error instanceof Error ? error.message : String(error)}`,
        { doi: normalizedDoi }
      );
    } finally {
      cleanup();
    }

    if (response.status === 404) return nullUnpaywallResult();
    if (response.status === 429) {
      throw new LiteratureDownloadError(
        "RPC_RATE_LIMITED",
        "Unpaywall API rate limit reached; retry later",
        { doi: normalizedDoi, status: response.status }
      );
    }
    if (!response.ok) {
      throw new LiteratureDownloadError(
        "NETWORK_ERROR",
        `Unpaywall request returned HTTP ${response.status}`,
        { doi: normalizedDoi, status: response.status }
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new LiteratureDownloadError(
        ConsumerErrorCodes.INVALID_JSON,
        `Unpaywall response JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
        { doi: normalizedDoi }
      );
    }

    const root = asRecord(body);
    const best = asRecord(root?.best_oa_location);
    if (!best) return nullUnpaywallResult();
    const url = normalizeString(best.url_for_pdf) || normalizeString(best.url);
    return {
      url,
      host_type: normalizeString(best.host_type),
      license: normalizeString(best.license),
      version: normalizeString(best.version)
    };
  });
}
