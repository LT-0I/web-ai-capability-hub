import { PageSnapshot, SnapshotElement } from "../shared/types";
import { selectorCandidatesForElement } from "../observe/selectorCandidates";
import { CapabilityDatabase } from "./database";
import { CapabilityRecord, UiElementRecord } from "./schemas";

export interface CapabilityExtractionOptions {
  targetId: string;
  kind?: string;
  captureId?: string;
}

function norm(value?: string): string { return (value || "").toLowerCase().replace(/\s+/g, " ").trim(); }
function now(): string { return new Date().toISOString(); }
function haystack(element: SnapshotElement): string { return norm([element.role, element.name, element.text, element.value, JSON.stringify(element.attributes || {})].join(" ")); }
function match(element: SnapshotElement, words: RegExp): boolean { return words.test(haystack(element)); }
function candidates(element?: SnapshotElement): string[] { return element ? selectorCandidatesForElement(element) : []; }
function first(elements: SnapshotElement[], role: string | RegExp, words: RegExp): SnapshotElement | undefined {
  return elements.find((element) => (typeof role === "string" ? norm(element.role) === role : role.test(norm(element.role))) && match(element, words));
}
function capId(targetId: string, name: string): string { return CapabilityDatabase.stableId("cap", `${targetId}:${name}`); }

export class CapabilityExtractor {
  extract(snapshot: PageSnapshot, options: CapabilityExtractionOptions): { uiElements: UiElementRecord[]; capabilities: CapabilityRecord[] } {
    const targetId = options.targetId;
    const captureId = options.captureId || CapabilityDatabase.stableId("capture", `${snapshot.url}:${snapshot.timestamp}`);
    const elements = snapshot.elements || [];
    const text = norm(snapshot.visibleText);
    const capabilities: CapabilityRecord[] = [];

    const push = (name: string, category: string, description: string, element?: SnapshotElement, confidence = 0.7, extra: Partial<CapabilityRecord> = {}) => {
      capabilities.push({
        id: capId(targetId, name),
        target_id: targetId,
        category,
        name,
        description,
        inputs: extra.inputs,
        outputs: extra.outputs,
        preconditions: extra.preconditions,
        selectors: extra.selectors || candidates(element),
        status: extra.status || "active",
        confidence,
        evidence: extra.evidence || { pageTitle: snapshot.title, url: snapshot.url, elementRef: element?.ref, role: element?.role, name: element?.name, text: element?.text?.slice(0, 160) },
        updated_at: now()
      });
    };

    const promptBox = elements.find((element) => ["textbox", "textarea"].includes(norm(element.role)) && /(prompt|message|ask|chat|search|query|question|输入|发送|提问)/i.test(haystack(element)))
      || elements.find((element) => ["textbox", "textarea"].includes(norm(element.role)));
    if (promptBox) push("enter_prompt", "chat", "Enter text into the visible prompt/search composer without submitting it.", promptBox, 0.92, { inputs: { text: "string" }, preconditions: ["User is on the target page", "Prompt field is visible"] });

    const send = first(elements, "button", /send|submit|arrow|发送|提交/i);
    if (send) push("send_message", "chat", "Send or submit the current draft. Requires explicit approval by default.", send, 0.78, { preconditions: ["Draft is prepared", "Manual approval gate passed"], evidence: { risky: true, elementRef: send.ref, name: send.name } });

    const newChat = first(elements, /button|link/, /new chat|new conversation|新建|新对话/i);
    if (newChat) push("new_chat", "navigation", "Start a new chat/conversation using a visible control.", newChat, 0.75);

    const history = first(elements, /button|link|tab/, /history|recent|conversation|chat list|历史|最近/i);
    if (history) push("open_history", "navigation", "Open conversation history or recent chat navigation if visible.", history, 0.68);

    const upload = elements.find((element) => (/(button|textbox|other)/.test(norm(element.role)) || norm(element.tagName) === "input") && /(upload|attach|file|add file|paperclip|image|document|上传|附件)/i.test(haystack(element)));
    const fileInput = elements.find((element) => norm(element.tagName) === "input" && norm(element.attributes?.type) === "file");
    if (upload || fileInput) push("upload_file", "files", "Upload a file through an official visible upload/file input control. Requires approval for sensitive files.", fileInput || upload, 0.82, { inputs: { files: "string[]" }, preconditions: ["Target site allows user-uploaded files", "User approved selected file paths"] });

    const download = elements.find((element) => ["download", "button", "link"].includes(norm(element.role)) && /(download|export|save|csv|ris|bibtex|citation|下载|导出)/i.test(haystack(element)));
    if (download) push("download_or_export", "download", "Trigger an official download/export control. Requires approval and access-policy checks.", download, 0.78, { outputs: { file: "downloaded file path" }, preconditions: ["Official site download/export control is visible", "Manual approval gate passed"] });

    const model = first(elements, /button|select|listbox|tab|menuitem/, /model|gpt-|claude|gemini|opus|sonnet|flash|pro|模型/i);
    if (model || /(gpt-4|gpt-5|claude|gemini|model)/i.test(text)) push("select_model_or_mode", "mode-selection", "Inspect or open the visible model/mode selector.", model, model ? 0.76 : 0.52);

    const image = first(elements, /button|link|menuitem|tab/, /image|picture|generate image|imagen|画图|图像/i);
    if (image || /(image generation|generate image|imagen|create an image|图像生成|画图)/i.test(text)) push("open_image_generation", "image-generation", "Open or select the visible image-generation tool/mode when present.", image, image ? 0.82 : 0.6);

    const artifact = first(elements, /button|link|tab|region/, /canvas|artifact|code|preview|画布|代码/i);
    if (artifact || /(canvas|artifact|code mode|preview)/i.test(text)) push("open_canvas_artifact_or_code", "workspace", "Open a canvas/artifact/code workspace panel if visible.", artifact, artifact ? 0.74 : 0.55);

    const advancedSearch = first(elements, /button|link|tab/, /advanced search|高级检索|advanced|专业检索/i);
    if (advancedSearch) push("open_advanced_search", "research-search", "Open the site-provided advanced search form.", advancedSearch, 0.84);

    const searchBox = elements.find((element) => ["textbox", "textarea"].includes(norm(element.role)) && /(search|query|keyword|title|author|检索|关键词)/i.test(haystack(element)));
    if (searchBox) push("enter_search_query", "research-search", "Enter a query into an official search box.", searchBox, 0.9, { inputs: { query: "string" } });

    const filter = first(elements, /button|checkbox|link|tab|menuitem/, /filter|facet|refine|year|type|subject|筛选|年份|主题/i);
    if (filter) push("apply_filter_or_facet", "research-filter", "Apply a visible filter/facet in a research database UI.", filter, 0.72);

    const resultText = snapshot.tables.length || /(results|result count|条结果|篇|records found)/i.test(text);
    if (resultText) push("read_results_metadata", "research-results", "Read visible search result metadata, result counts, tables, and lists.", undefined, 0.7, { outputs: { snapshot: "visible result metadata" }, selectors: snapshot.tables.map((table) => table.selector).filter(Boolean) as string[] });

    const uiElements: UiElementRecord[] = elements.map((element) => ({
      id: CapabilityDatabase.stableId("uie", `${captureId}:${element.ref}`),
      capture_id: captureId,
      target_id: targetId,
      ref: element.ref,
      role: element.role,
      accessible_name: element.name,
      visible_text: element.text,
      selector_candidates: selectorCandidatesForElement(element),
      visible: element.visible,
      confidence: element.visible === false ? 0.35 : 0.75,
      evidence: { url: snapshot.url, title: snapshot.title },
      source: element
    }));

    return { uiElements, capabilities: dedupeCapabilities(capabilities) };
  }
}

function dedupeCapabilities(capabilities: CapabilityRecord[]): CapabilityRecord[] {
  const map = new Map<string, CapabilityRecord>();
  for (const capability of capabilities) {
    const existing = map.get(`${capability.target_id}:${capability.name}`);
    if (!existing || capability.confidence > existing.confidence) map.set(`${capability.target_id}:${capability.name}`, capability);
  }
  return Array.from(map.values());
}
