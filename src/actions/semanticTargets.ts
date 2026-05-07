import { PageSnapshot, SemanticTarget, SnapshotElement } from "../shared/types";

function norm(value?: string): string {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function findElementBySemanticTarget(snapshot: PageSnapshot, target: SemanticTarget): SnapshotElement | undefined {
  if (target.ref) return snapshot.elements.find((element) => element.ref === target.ref);
  if (target.selector) return snapshot.elements.find((element) => element.selector === target.selector || element.selectorCandidates?.includes(target.selector!));
  const role = norm(target.role);
  const name = norm(target.name || target.label || target.placeholder || target.text);
  const roleMatches = (elementRole: string): boolean => {
    const actual = norm(elementRole);
    if (!role) return true;
    if (actual.includes(role)) return true;
    if (role === "textbox" && ["textarea", "searchbox", "input"].includes(actual)) return true;
    if (role === "button" && actual === "download") return true;
    return false;
  };
  const matches = snapshot.elements.filter((element) => {
    const roleOk = roleMatches(String(element.role));
    const elementName = norm(`${element.name} ${element.text || ""} ${element.attributes?.placeholder || ""}`);
    const nameOk = !name || elementName.includes(name);
    return roleOk && nameOk;
  });
  if (matches.length === 0) return undefined;
  return matches[target.index || 0];
}

export function describeSemanticTarget(target?: SemanticTarget, selector?: string): string {
  if (selector) return selector;
  if (!target) return "active page";
  if (target.selector) return target.selector;
  if (target.ref) return target.ref;
  const parts = [target.role, target.name, target.label, target.placeholder, target.text].filter(Boolean);
  return parts.join(" / ") || "semantic target";
}

export function getLocator(page: any, target?: SemanticTarget, selector?: string): any {
  if (selector) return page.locator(selector);
  if (!target) throw new Error("Action requires a selector or semantic target.");
  if (target.selector) return page.locator(target.selector);
  if (target.ref && target.selector) return page.locator(target.selector);
  if (target.role && target.name && typeof page.getByRole === "function") {
    const name = new RegExp(target.name, "i");
    const role = norm(target.role);
    if (role === "textbox") {
      return page.getByRole("textbox", { name }).or(page.getByRole("searchbox", { name })).first();
    }
    if (role === "download") {
      return page.getByRole("link", { name }).or(page.getByRole("button", { name })).first();
    }
    return page.getByRole(target.role as any, { name });
  }
  if (target.label && typeof page.getByLabel === "function") return page.getByLabel(new RegExp(target.label, "i"));
  if (target.placeholder && typeof page.getByPlaceholder === "function") return page.getByPlaceholder(new RegExp(target.placeholder, "i"));
  if (target.text && typeof page.getByText === "function") return page.getByText(new RegExp(target.text, "i"));
  if (target.name && typeof page.getByText === "function") return page.getByText(new RegExp(target.name, "i"));
  throw new Error(`Could not resolve semantic target: ${describeSemanticTarget(target)}`);
}
