import { PageSnapshot, SiteMap, SiteMapDiff, SnapshotElement } from "../shared/types";

export function siteMapFromSnapshot(site: string, snapshot: PageSnapshot, notes?: string): SiteMap {
  return {
    site,
    capturedAt: snapshot.timestamp,
    url: snapshot.url,
    title: snapshot.title,
    elements: snapshot.elements,
    forms: snapshot.forms,
    tables: snapshot.tables,
    lists: snapshot.lists,
    notes
  };
}

function key(element: SnapshotElement): string {
  return [element.role, element.name, element.selector || element.text || ""].join("|").toLowerCase();
}

function changed(before: SnapshotElement, after: SnapshotElement): string[] {
  const changes: string[] = [];
  for (const field of ["role", "name", "selector", "text", "disabled", "checked"] as const) {
    if ((before as any)[field] !== (after as any)[field]) changes.push(String(field));
  }
  return changes;
}

export function diffSiteMaps(previous: SiteMap, current: SiteMap): SiteMapDiff {
  const prevByKey = new Map(previous.elements.map((element) => [key(element), element]));
  const currByKey = new Map(current.elements.map((element) => [key(element), element]));
  const addedElements = current.elements.filter((element) => !prevByKey.has(key(element)));
  const removedElements = previous.elements.filter((element) => !currByKey.has(key(element)));
  const changedElements = current.elements
    .filter((element) => prevByKey.has(key(element)))
    .map((element) => ({ before: prevByKey.get(key(element))!, after: element, changes: changed(prevByKey.get(key(element))!, element) }))
    .filter((entry) => entry.changes.length);
  const formKey = (form: any) => `${form.name || ""}|${form.selector || ""}`.toLowerCase();
  const prevForms = new Set(previous.forms.map(formKey));
  const currForms = new Set(current.forms.map(formKey));
  const addedForms = current.forms.filter((form) => !prevForms.has(formKey(form)));
  const removedForms = previous.forms.filter((form) => !currForms.has(formKey(form)));
  const summary = `${addedElements.length} added elements, ${removedElements.length} removed elements, ${changedElements.length} changed elements, ${addedForms.length} added forms, ${removedForms.length} removed forms.`;
  return { site: current.site, previousCapturedAt: previous.capturedAt, currentCapturedAt: current.capturedAt, addedElements, removedElements, changedElements, addedForms, removedForms, summary };
}
