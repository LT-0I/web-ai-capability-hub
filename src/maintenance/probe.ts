export type ReachStatus = "reachable" | "reachable_login_wall" | "blocked" | "unreachable";

export interface ProbeResult {
  url: string;
  status: ReachStatus;
  httpStatus: number;
  elapsedMs: number;
  title?: string;
  notes?: string;
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const BLOCKED_MARKERS = [
  "access denied",
  "captcha",
  "robot",
  "异常下载",
  "IP被封"
];

const LOGIN_WALL_MARKERS = [
  "sign in",
  "log in",
  "institution",
  "IP login",
  "登录"
];

const KNOWN_PORTAL_NAMES = [
  "PubMed",
  "NCBI",
  "Web of Science",
  "Clarivate",
  "CNKI",
  "IEEE Xplore",
  "Scopus"
];

const SUCCESS_MARKERS = [
  "search results",
  "advanced search",
  "document search",
  "search biomedical literature",
  "all databases"
];

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  const title = normalize(decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "")));
  return title || undefined;
}

function includesAny(text: string, markers: string[]): string | undefined {
  const lowerText = text.toLowerCase();
  return markers.find((marker) => lowerText.includes(marker.toLowerCase()));
}

function classify(httpStatus: number, html: string, title?: string): { status: ReachStatus; notes?: string } {
  const combined = `${title || ""} ${html.slice(0, 20000)}`;
  const blockedMarker = includesAny(combined, BLOCKED_MARKERS);
  if (blockedMarker) return { status: "blocked", notes: `blocked marker: ${blockedMarker}` };

  const loginWallMarker = includesAny(combined, LOGIN_WALL_MARKERS);
  if (loginWallMarker) return { status: "reachable_login_wall", notes: `login wall marker: ${loginWallMarker}` };

  const portalMarker = includesAny(title || "", KNOWN_PORTAL_NAMES) || includesAny(combined, SUCCESS_MARKERS);
  if (portalMarker) return { status: "reachable", notes: `reachable marker: ${portalMarker}` };

  if (httpStatus >= 200 && httpStatus < 400) return { status: "reachable" };
  if ([401, 403, 429].includes(httpStatus)) return { status: "blocked", notes: `HTTP ${httpStatus}` };
  return { status: "unreachable", notes: `HTTP ${httpStatus}` };
}

export async function probeUrl(url: string, options?: { timeoutMs?: number }): Promise<ProbeResult> {
  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      signal: controller.signal
    });
    const html = await response.text();
    const title = extractTitle(html);
    const classified = classify(response.status, html, title);
    return {
      url,
      status: classified.status,
      httpStatus: response.status,
      elapsedMs: elapsedSince(startedAt),
      title,
      notes: classified.notes
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      url,
      status: "unreachable",
      httpStatus: 0,
      elapsedMs: elapsedSince(startedAt),
      notes: message
    };
  } finally {
    clearTimeout(timeout);
  }
}
