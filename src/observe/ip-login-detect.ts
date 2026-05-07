import type { Page } from "playwright";

export interface IpLoginCandidate {
  selector: string;
  text: string;
  confidence: "high" | "medium" | "low";
}

interface RawIpLoginCandidate {
  selector?: string;
  text?: string;
  visible?: boolean;
}

const IP_LOGIN_TERMS = [
  "IP登录",
  "IP access",
  "institution",
  "shibboleth",
  "openathens",
  "wayf",
  "CARSI",
  "access check",
  "机构登录",
  "校园网登录"
];

const HIGH_CONFIDENCE_PHRASES = [
  "IP登录",
  "IP login",
  "IP access",
  "IP authentication",
  "institutional login",
  "institutional sign in",
  "access through your institution",
  "access through institution",
  "shibboleth",
  "openathens",
  "wayf",
  "CARSI",
  "access check",
  "check access",
  "机构登录",
  "校园网登录"
];

const CONFIDENCE_WEIGHT: Record<IpLoginCandidate["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function includesNormalized(haystack: string, needle: string): boolean {
  return haystack.includes(normalizeText(needle));
}

function confidenceForText(text: string): IpLoginCandidate["confidence"] | undefined {
  const normalized = normalizeText(text);
  if (!normalized) return undefined;
  if (!IP_LOGIN_TERMS.some((term) => includesNormalized(normalized, term))) return undefined;
  if (HIGH_CONFIDENCE_PHRASES.some((phrase) => includesNormalized(normalized, phrase) || normalized === normalizeText(phrase))) return "high";
  if (normalized === "institution" || normalized.includes("institution")) return normalized.length <= "institutional login".length ? "high" : "medium";
  return "low";
}

function rankCandidates(rawCandidates: RawIpLoginCandidate[]): IpLoginCandidate[] {
  const seen = new Set<string>();
  return rawCandidates
    .map((candidate, index) => {
      const selector = String(candidate.selector || "").trim();
      const text = String(candidate.text || "").replace(/\s+/g, " ").trim();
      if (!selector || !text || candidate.visible === false) return undefined;
      const confidence = confidenceForText(text);
      if (!confidence) return undefined;
      return { selector, text, confidence, index };
    })
    .filter((candidate): candidate is IpLoginCandidate & { index: number } => {
      if (!candidate || seen.has(candidate.selector)) return false;
      seen.add(candidate.selector);
      return true;
    })
    .sort((left, right) => CONFIDENCE_WEIGHT[right.confidence] - CONFIDENCE_WEIGHT[left.confidence] || left.index - right.index)
    .map(({ selector, text, confidence }) => ({ selector, text, confidence }));
}

export async function detectIpLoginCandidates(page: Page): Promise<IpLoginCandidate[]> {
  const rawCandidates = await page.evaluate(() => {
    function clean(text: string | null | undefined): string {
      return String(text || "").replace(/\s+/g, " ").trim();
    }

    function escapeCss(value: string): string {
      const css = (globalThis as any).CSS;
      if (css?.escape) return css.escape(value);
      return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
    }

    function selectorFor(element: Element): string {
      const id = (element as HTMLElement).id;
      if (id) return `#${escapeCss(id)}`;
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && parts.length < 4) {
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const siblings = Array.from(parent.children) as Element[];
        const sameTagSiblings = siblings.filter((sibling) => sibling.tagName === current?.tagName);
        const index = sameTagSiblings.indexOf(current) + 1;
        parts.unshift(sameTagSiblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
        current = parent;
      }
      return parts.join(" > ");
    }

    function isVisible(element: Element): boolean {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      return style.display !== "none"
        && style.visibility !== "hidden"
        && style.opacity !== "0"
        && !!(htmlElement.offsetWidth || htmlElement.offsetHeight || htmlElement.getClientRects().length);
    }

    return Array.from(document.querySelectorAll("button, a[href]")).map((element) => {
      const htmlElement = element as HTMLButtonElement | HTMLAnchorElement;
      const text = clean([
        htmlElement.getAttribute("aria-label"),
        htmlElement.getAttribute("title"),
        htmlElement.innerText,
        htmlElement.textContent,
        "value" in htmlElement ? String((htmlElement as HTMLButtonElement).value || "") : ""
      ].filter(Boolean).join(" "));
      return {
        selector: selectorFor(htmlElement),
        text,
        visible: isVisible(htmlElement)
      };
    });
  });
  return rankCandidates(rawCandidates);
}
