import { SnapshotElement } from "../shared/types";

function cssEscape(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, (char) => `\\${char}`);
}

function quote(value: string): string {
  return value.replace(/"/g, '\\"');
}

export function selectorCandidatesForElement(element: SnapshotElement): string[] {
  const attrs = element.attributes || {};
  const tag = (element.tagName || "*").toLowerCase();
  const candidates = [
    element.selector,
    attrs.id ? `#${cssEscape(attrs.id)}` : undefined,
    attrs["data-testid"] ? `[data-testid="${quote(attrs["data-testid"])}"]` : undefined,
    attrs["data-test"] ? `[data-test="${quote(attrs["data-test"])}"]` : undefined,
    attrs.name ? `${tag}[name="${quote(attrs.name)}"]` : undefined,
    attrs["aria-label"] ? `${tag}[aria-label="${quote(attrs["aria-label"])}"]` : undefined,
    attrs.placeholder ? `${tag}[placeholder="${quote(attrs.placeholder)}"]` : undefined,
    element.role && element.name ? `role=${element.role}[name="${quote(element.name)}"]` : undefined,
    ...(element.selectorCandidates || [])
  ].filter(Boolean) as string[];
  return Array.from(new Set(candidates));
}

export function enrichSelectorCandidates(elements: SnapshotElement[]): SnapshotElement[] {
  return elements.map((element) => ({ ...element, selectorCandidates: selectorCandidatesForElement(element) }));
}
