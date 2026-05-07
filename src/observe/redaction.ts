import { redactSensitive } from "../safety/redaction";
import { PageSnapshot } from "../shared/types";

export function redactSnapshot(snapshot: PageSnapshot): PageSnapshot {
  return {
    ...snapshot,
    visibleText: String(redactSensitive(snapshot.visibleText)),
    elements: snapshot.elements.map((element) => ({
      ...element,
      name: String(redactSensitive(element.name)),
      text: element.text ? String(redactSensitive(element.text)) : element.text,
      value: element.value ? "[REDACTED_VALUE]" : element.value
    })),
    forms: snapshot.forms.map((form) => ({ ...form, fields: form.fields.map((field) => ({ ...field, value: field.value ? "[REDACTED_VALUE]" : field.value })) }))
  };
}
