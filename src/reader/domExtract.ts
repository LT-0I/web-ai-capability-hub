const fs = require("node:fs");
import { PageSnapshot, SnapshotElement, SnapshotForm, SnapshotIframe, SnapshotList, SnapshotTable } from "../shared/types";

export type SnapshotMode = "full" | "lite";

export interface SnapshotExtractOptions {
  mode?: SnapshotMode;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function attr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = attrs.match(re);
  return match ? decodeEntities(match[1] || match[2] || match[3] || "") : undefined;
}

function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`, "i").test(attrs);
}

function selectorFrom(tag: string, attrs: string, text?: string): string | undefined {
  const id = attr(attrs, "id");
  if (id) return `#${cssEscape(id)}`;
  const name = attr(attrs, "name");
  if (name) return `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
  const aria = attr(attrs, "aria-label");
  if (aria) return `${tag}[aria-label="${aria.replace(/"/g, '\\"')}"]`;
  const placeholder = attr(attrs, "placeholder");
  if (placeholder) return `${tag}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;
  if (text && tag === "button") return `button:has-text("${text.slice(0, 40).replace(/"/g, '\\"')}")`;
  return tag;
}

function cssEscape(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, (char) => `\\${char}`);
}

function labelMap(html: string): Record<string, string> {
  const labels: Record<string, string> = {};
  const labelRe = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let match: RegExpExecArray | null;
  while ((match = labelRe.exec(html))) {
    const forId = attr(match[1], "for");
    if (forId) labels[forId] = stripTags(match[2]);
  }
  return labels;
}

function elementName(attrs: string, body: string | undefined, labels: Record<string, string>): string {
  const id = attr(attrs, "id");
  return (
    attr(attrs, "aria-label") ||
    attr(attrs, "title") ||
    (id ? labels[id] : undefined) ||
    attr(attrs, "placeholder") ||
    attr(attrs, "value") ||
    (body ? stripTags(body) : undefined) ||
    attr(attrs, "name") ||
    ""
  ).trim();
}

function elementAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrs))) out[match[1]] = decodeEntities(match[2] || match[3] || match[4] || "");
  return out;
}

function pushElement(elements: SnapshotElement[], role: string, tag: string, attrs: string, body: string | undefined, labels: Record<string, string>): void {
  const name = elementName(attrs, body, labels);
  const text = body ? stripTags(body) : undefined;
  const selector = selectorFrom(tag, attrs, text || name);
  const type = attr(attrs, "type")?.toLowerCase();
  elements.push({
    ref: `e${elements.length + 1}`,
    role,
    name,
    text,
    selector,
    tagName: tag,
    value: attr(attrs, "value"),
    checked: hasAttr(attrs, "checked") || attr(attrs, "aria-checked") === "true",
    disabled: hasAttr(attrs, "disabled") || attr(attrs, "aria-disabled") === "true",
    visible: type !== "hidden",
    attributes: elementAttrs(attrs),
    selectorCandidates: [selector, attr(attrs, "id") ? `#${attr(attrs, "id")}` : undefined, attr(attrs, "name") ? `${tag}[name="${attr(attrs, "name")}"]` : undefined].filter(Boolean) as string[]
  });
}

function extractElementsFromHtml(html: string): SnapshotElement[] {
  const labels = labelMap(html);
  const elements: SnapshotElement[] = [];
  const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const inputRe = /<input\b([^>]*)>/gi;
  const textareaRe = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi;
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  const roleRe = /<([a-z0-9-]+)\b([^>]*\srole\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)[^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = buttonRe.exec(html))) pushElement(elements, "button", "button", match[1], match[2], labels);
  while ((match = linkRe.exec(html))) pushElement(elements, attr(match[1], "download") !== undefined || hasAttr(match[1], "download") ? "download" : "link", "a", match[1], match[2], labels);
  while ((match = inputRe.exec(html))) {
    const type = (attr(match[1], "type") || "text").toLowerCase();
    const role = type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : ["button", "submit", "reset"].includes(type) ? "button" : "textbox";
    pushElement(elements, role, "input", match[1], undefined, labels);
  }
  while ((match = textareaRe.exec(html))) pushElement(elements, "textarea", "textarea", match[1], match[2], labels);
  while ((match = selectRe.exec(html))) pushElement(elements, "select", "select", match[1], match[2], labels);
  while ((match = roleRe.exec(html))) {
    const role = attr(match[2], "role") || "other";
    if (["button", "link", "textbox", "tab", "menu", "menuitem", "checkbox", "radio"].includes(role)) {
      pushElement(elements, role, match[1].toLowerCase(), match[2], match[3], labels);
    }
  }
  return elements;
}

function elementKey(element: SnapshotElement): string {
  return [
    element.selector || "",
    element.role || "",
    (element.name || "").toLowerCase(),
    (element.text || "").toLowerCase(),
    element.tagName || ""
  ].join("\u0000");
}

function dedupeElements(elements: SnapshotElement[]): SnapshotElement[] {
  const seen = new Set<string>();
  const deduped: SnapshotElement[] = [];
  for (const element of elements) {
    const key = elementKey(element);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...element, ref: `e${deduped.length + 1}` });
  }
  return deduped;
}

function compactElement(element: SnapshotElement): SnapshotElement {
  const out: SnapshotElement = {
    ref: element.ref,
    role: element.role,
    name: element.name
  };
  if (element.text && element.text !== element.name) out.text = element.text;
  if (element.selector) out.selector = element.selector;
  if (element.tagName) out.tagName = element.tagName;
  if (element.value) out.value = element.value;
  if (element.checked) out.checked = element.checked;
  if (element.disabled) out.disabled = element.disabled;
  if (element.visible === false) out.visible = element.visible;
  const selectorCandidates = (element.selectorCandidates || []).filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);
  if (selectorCandidates.length > 1) out.selectorCandidates = selectorCandidates;
  return out;
}

function compactForms(forms: SnapshotForm[], elements: SnapshotElement[]): SnapshotForm[] {
  if (!forms.length) return [];
  const bySelector = new Map(elements.map((element) => [element.selector, element]));
  return forms.map((form, index) => ({
    ref: `f${index + 1}`,
    ...(form.name ? { name: form.name } : {}),
    ...(form.selector ? { selector: form.selector } : {}),
    ...(form.method ? { method: form.method } : {}),
    ...(form.action ? { action: form.action } : {}),
    fields: form.fields
      .map((field) => (field.selector ? bySelector.get(field.selector) || field : field))
      .map(compactElement)
  })).filter((form) => form.fields.length);
}

function compactSnapshot(snapshot: PageSnapshot): PageSnapshot {
  const elements = dedupeElements(snapshot.elements).map(compactElement);
  const visibleText = elements
    .flatMap((element) => [element.name, element.text].filter(Boolean) as string[])
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(" ")
    .slice(0, 4000);
  return {
    url: snapshot.url,
    title: snapshot.title,
    timestamp: snapshot.timestamp,
    visibleText,
    elements,
    forms: compactForms(snapshot.forms, elements),
    tables: snapshot.tables.filter((table) => table.headers.length || table.rows.length),
    lists: snapshot.lists.filter((list) => list.items.length),
    iframes: snapshot.iframes.map((frame, index) => ({
      ref: `i${index + 1}`,
      ...(frame.title ? { title: frame.title } : {}),
      ...(frame.selector ? { selector: frame.selector } : {}),
      accessible: frame.accessible
    })),
    warnings: snapshot.warnings
  };
}

function extractTables(html: string): SnapshotTable[] {
  const tables: SnapshotTable[] = [];
  const tableRe = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(html))) {
    const tableHtml = match[2];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[][] = [];
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(tableHtml))) {
      const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
      const row: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRe.exec(rowMatch[1]))) row.push(stripTags(cellMatch[1]));
      if (row.length) rows.push(row);
    }
    const captionMatch = tableHtml.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
    const headers = rows[0] || [];
    tables.push({
      ref: `t${tables.length + 1}`,
      caption: captionMatch ? stripTags(captionMatch[1]) : undefined,
      selector: selectorFrom("table", match[1]),
      headers,
      rows: rows.slice(headers.length ? 1 : 0)
    });
  }
  return tables;
}

function extractLists(html: string): SnapshotList[] {
  const lists: SnapshotList[] = [];
  const listRe = /<(ul|ol)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = listRe.exec(html))) {
    const items: string[] = [];
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let li: RegExpExecArray | null;
    while ((li = liRe.exec(match[3]))) items.push(stripTags(li[1]));
    if (items.length) lists.push({ ref: `l${lists.length + 1}`, selector: selectorFrom(match[1], match[2]), ordered: match[1].toLowerCase() === "ol", items });
  }
  return lists;
}

function extractForms(html: string, elements: SnapshotElement[]): SnapshotForm[] {
  const forms: SnapshotForm[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match: RegExpExecArray | null;
  while ((match = formRe.exec(html))) {
    const formElements = extractElementsFromHtml(match[2]);
    forms.push({
      ref: `f${forms.length + 1}`,
      name: attr(match[1], "aria-label") || attr(match[1], "name") || attr(match[1], "id"),
      selector: selectorFrom("form", match[1]),
      method: attr(match[1], "method"),
      action: attr(match[1], "action"),
      fields: formElements.filter((element) => ["textbox", "textarea", "select", "checkbox", "radio"].includes(element.role))
    });
  }
  if (!forms.length) {
    const fields = elements.filter((element) => ["textbox", "textarea", "select", "checkbox", "radio"].includes(element.role));
    if (fields.length) forms.push({ ref: "f1", name: "implicit form", fields });
  }
  return forms;
}

function extractIframes(html: string): SnapshotIframe[] {
  const frames: SnapshotIframe[] = [];
  const re = /<iframe\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) frames.push({ ref: `i${frames.length + 1}`, src: attr(match[1], "src"), title: attr(match[1], "title"), selector: selectorFrom("iframe", match[1]), accessible: false, summary: "Cross-frame content is summarized only when Playwright can access it." });
  return frames;
}

export function extractSnapshotFromHtml(html: string, url = "about:fixture", title?: string, options: SnapshotExtractOptions = {}): PageSnapshot {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const resolvedTitle = title || (titleMatch ? stripTags(titleMatch[1]) : "Fixture Page");
  const elements = dedupeElements(extractElementsFromHtml(html));
  const tables = extractTables(html);
  const lists = extractLists(html);
  const forms = extractForms(html, elements);
  const iframes = extractIframes(html);
  const visibleText = stripTags(html).slice(0, 16000);
  const snapshot = { url, title: resolvedTitle, timestamp: new Date().toISOString(), visibleText, elements, forms, tables, lists, iframes, warnings: [] };
  return options.mode === "lite" ? compactSnapshot(snapshot) : snapshot;
}

export function extractSnapshotFromFile(filePath: string, url = `file://${filePath}`, options: SnapshotExtractOptions = {}): PageSnapshot {
  const html = fs.readFileSync(filePath, "utf-8");
  return extractSnapshotFromHtml(html, url, undefined, options);
}

export async function extractSnapshotFromPage(page: any, options: SnapshotExtractOptions = {}): Promise<PageSnapshot> {
  const lite = options.mode === "lite";
  const data = await page.evaluate((liteMode: boolean) => {
    const isVisible = (el: Element): boolean => {
      const style = window.getComputedStyle(el as HTMLElement);
      const rect = (el as HTMLElement).getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width >= 0 && rect.height >= 0;
    };
    const cssEscape = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, (char) => `\\${char}`);
    const text = (el: Element): string => ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const nameFor = (el: Element): string => {
      const html = el as HTMLElement;
      const aria = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("value") || "";
      if (aria) return aria.trim();
      if (html.id) {
        const label = document.querySelector(`label[for="${cssEscape(html.id)}"]`);
        if (label?.textContent) return label.textContent.replace(/\s+/g, " ").trim();
      }
      return text(el) || el.getAttribute("name") || "";
    };
    const selectorFor = (el: Element): string => {
      const html = el as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (html.id) return `#${cssEscape(html.id)}`;
      const name = el.getAttribute("name");
      if (name) return `${tag}[name="${name.replace(/"/g, '\\"')}"]`;
      const aria = el.getAttribute("aria-label");
      if (aria) return `${tag}[aria-label="${aria.replace(/"/g, '\\"')}"]`;
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) return `${tag}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;
      return tag;
    };
    const roleFor = (el: Element): string => {
      const explicit = el.getAttribute("role");
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (tag === "button") return "button";
      if (tag === "a") return el.hasAttribute("download") ? "download" : "link";
      if (tag === "textarea") return "textarea";
      if (tag === "select") return "select";
      if (tag === "input" && type === "checkbox") return "checkbox";
      if (tag === "input" && type === "radio") return "radio";
      if (tag === "input" && ["button", "submit", "reset"].includes(type)) return "button";
      if (tag === "input") return "textbox";
      if (tag === "table") return "table";
      if (tag === "ul" || tag === "ol") return "list";
      if (tag === "iframe") return "iframe";
      return "other";
    };
    const candidates = Array.from(document.querySelectorAll('button,a,input,textarea,select,[role],iframe'));
    const elements = candidates.filter(isVisible).slice(0, 250).map((el, index) => {
      const selector = selectorFor(el);
      const attributes: Record<string, string> = {};
      if (!liteMode) for (const attr of Array.from(el.attributes || [])) attributes[attr.name] = attr.value;
      return {
        ref: `e${index + 1}`,
        role: roleFor(el),
        name: nameFor(el),
        text: text(el),
        selector,
        tagName: el.tagName.toLowerCase(),
        value: (el as HTMLInputElement).value,
        checked: (el as HTMLInputElement).checked,
        disabled: (el as HTMLInputElement).disabled || el.getAttribute("aria-disabled") === "true",
        visible: true,
        attributes: liteMode ? undefined : attributes,
        selectorCandidates: [selector]
      };
    });
    const forms = Array.from(document.querySelectorAll("form")).slice(0, 60).map((form, index) => ({
      ref: `f${index + 1}`,
      name: nameFor(form),
      selector: selectorFor(form),
      method: form.getAttribute("method") || undefined,
      action: form.getAttribute("action") || undefined,
      fields: elements.filter((element) => ["textbox", "textarea", "select", "checkbox", "radio"].includes(element.role))
    }));
    const tables = liteMode ? [] : Array.from(document.querySelectorAll("table")).slice(0, 40).map((table, index) => {
      const rows = Array.from(table.querySelectorAll("tr")).slice(0, 100).map((row) => Array.from(row.querySelectorAll("th,td")).map((cell) => text(cell)));
      const headers = rows[0] || [];
      return { ref: `t${index + 1}`, caption: table.querySelector("caption")?.textContent?.trim(), selector: selectorFor(table), headers, rows: rows.slice(headers.length ? 1 : 0) };
    });
    const lists = liteMode ? [] : Array.from(document.querySelectorAll("ul,ol")).slice(0, 60).map((list, index) => ({
      ref: `l${index + 1}`,
      selector: selectorFor(list),
      ordered: list.tagName.toLowerCase() === "ol",
      items: Array.from(list.querySelectorAll("li")).slice(0, 100).map((li) => text(li))
    })).filter((list) => list.items.length);
    const iframes = Array.from(document.querySelectorAll("iframe")).slice(0, 50).map((frame, index) => ({
      ref: `i${index + 1}`,
      title: frame.getAttribute("title") || undefined,
      src: frame.getAttribute("src") || undefined,
      selector: selectorFor(frame),
      accessible: false,
      summary: "Iframe DOM requires frame-level access."
    }));
    return { visibleText: liteMode ? "" : (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 16000), elements, forms, tables, lists, iframes };
  }, lite);
  const snapshot = {
    url: typeof page.url === "function" ? page.url() : "about:blank",
    title: typeof page.title === "function" ? await page.title() : "Untitled",
    timestamp: new Date().toISOString(),
    visibleText: lite ? "" : data.visibleText,
    elements: dedupeElements(data.elements),
    forms: data.forms,
    tables: lite ? [] : data.tables,
    lists: lite ? [] : data.lists,
    iframes: data.iframes,
    warnings: []
  };
  return lite ? compactSnapshot(snapshot) : snapshot;
}
