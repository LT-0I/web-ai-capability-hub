import { objectSchema, scalar } from "../utils/schema";
import { BrowserAction } from "../shared/types";

const targetSchema = {
  type: "object",
  description: "Semantic target. Prefer role+name or selector discovered from browser_read.",
  properties: {
    selector: scalar.string("CSS selector"),
    role: scalar.string("ARIA role"),
    name: scalar.string("Accessible name"),
    text: scalar.string("Visible text"),
    placeholder: scalar.string("Placeholder text"),
    label: scalar.string("Label text"),
    ref: scalar.string("Snapshot ref such as e4"),
    index: scalar.number("Zero-based match index")
  },
  additionalProperties: true
};

export const browserStartInput = objectSchema<{ cdpEndpoint?: string; headless?: boolean }>({
  cdpEndpoint: scalar.string("Optional CDP endpoint; only used when WAH_CONNECT_CDP=true"),
  headless: scalar.boolean("Use headless mode only for local tests/fixtures")
});

export const browserOpenInput = objectSchema<{ url: string; profile?: string; confirmed?: boolean }>({
  url: scalar.string("URL to open"),
  profile: scalar.string("Managed browser profile name"),
  confirmed: scalar.boolean("Set true after human approval when required")
}, ["url"]);

export const browserReadInput = objectSchema<{ profile?: string; url?: string; screenshot?: boolean; includeAccessibility?: boolean }>({
  profile: scalar.string("Managed browser profile name"),
  url: scalar.string("Optional URL to open or prefer before reading"),
  screenshot: scalar.boolean("Capture a full-page screenshot"),
  includeAccessibility: scalar.boolean("Include accessibility-tree summary")
});

export const browserActionInput = objectSchema<BrowserAction>({
  type: scalar.enum(["click", "type", "press", "select", "upload", "wait", "scroll", "extract", "download", "screenshot"], "Browser action type"),
  selector: scalar.string("CSS selector"),
  target: targetSchema,
  text: scalar.string("Text to type or wait for"),
  key: scalar.string("Key to press"),
  option: scalar.string("Option label/value to select"),
  files: scalar.array(scalar.string("File path"), "Upload files"),
  waitFor: scalar.enum(["text", "selector", "navigation", "download", "timeout"], "Wait condition"),
  timeoutMs: scalar.number("Timeout in milliseconds"),
  direction: scalar.enum(["up", "down"], "Scroll direction"),
  amount: scalar.number("Scroll amount in pixels"),
  extract: scalar.enum(["table", "list", "text", "snapshot"], "Extraction type"),
  dryRun: scalar.boolean("Validate and describe without executing"),
  confirmed: scalar.boolean("Set true after human approval")
}, ["type"]);

export const recipeRunInput = objectSchema<{ id: string; variables?: Record<string, string>; confirmed?: boolean }>({
  id: scalar.string("Recipe id"),
  variables: scalar.object("Recipe variables"),
  confirmed: scalar.boolean("Set true after human approval")
}, ["id"]);

export const siteMapInput = objectSchema<{ site: string; notes?: string }>({
  site: scalar.string("Site id"),
  notes: scalar.string("Optional notes")
}, ["site"]);

export const notesInput = objectSchema<{ site: string; notes: string }>({
  site: scalar.string("Site id"),
  notes: scalar.string("Markdown notes to append")
}, ["site", "notes"]);

export const browserLaunchInput = objectSchema<{ profile?: string; url?: string; cdpPort?: number; executablePath?: string }>({
  profile: scalar.string("Managed browser profile name"),
  url: scalar.string("Optional URL to open"),
  cdpPort: scalar.number("Remote debugging port"),
  executablePath: scalar.string("Chrome/Edge executable path override")
});

export const browserStatusInput = objectSchema<{ profile?: string }>({ profile: scalar.string("Managed browser profile name") });

export const consumerHealthInput = objectSchema<{ target: string; profile: string }>({
  target: scalar.string("Target id such as chatgpt/gemini/claude"),
  profile: scalar.string("Managed browser profile name")
}, ["target", "profile"]);

export const capabilityUpdateInput = objectSchema<{ target: string; kind?: string; profile?: string; fixture?: string; url?: string } >({
  target: scalar.string("Target id such as gemini/chatgpt/claude/cnki"),
  kind: scalar.string("Target kind"),
  profile: scalar.string("Browser profile"),
  fixture: scalar.string("Optional local HTML fixture for tests"),
  url: scalar.string("Optional target URL override")
}, ["target"]);

export const capabilityQueryInput = objectSchema<{ target?: string; text?: string; category?: string; limit?: number }>({
  target: scalar.string("Target id"),
  text: scalar.string("Search text"),
  category: scalar.string("Capability category"),
  limit: scalar.number("Maximum results")
});

export const capabilityExportInput = objectSchema<{ target?: string; out?: string }>({
  target: scalar.string("Target id"),
  out: scalar.string("Output JSON path")
});

export const workflowCompileInput = objectSchema<{ file: string }>({ file: scalar.string("Workflow YAML/JSON file path") }, ["file"]);

export const workflowRunInput = objectSchema<{ file: string; profile?: string; url?: string; dryRun?: boolean; approvedStepIds?: string[]; approvalReason?: string }>({
  file: scalar.string("Workflow YAML/JSON file path"),
  profile: scalar.string("Managed browser profile override"),
  url: scalar.string("Optional target URL override"),
  dryRun: scalar.boolean("Compile and plan without executing"),
  approvedStepIds: scalar.array(scalar.string("Approved workflow step id"), "Step ids approved for retry"),
  approvalReason: scalar.string("Optional human approval reason for approvedStepIds")
}, ["file"]);

export const workflowExecuteInput = objectSchema<{
  file?: string;
  workflow?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  dryRun?: boolean;
  profile?: string;
  url?: string;
  approvedStepIds?: string[];
  approvalReason?: string;
}>({
  file: scalar.string("Optional workflow YAML/JSON file path for compatibility; prefer inline workflow or plan"),
  workflow: scalar.object("Inline workflow definition object"),
  plan: scalar.object("Inline pre-compiled workflow action plan"),
  dryRun: scalar.boolean("Compile and plan without executing; defaults to true"),
  profile: scalar.string("Managed browser profile override"),
  url: scalar.string("Optional target URL override"),
  approvedStepIds: scalar.array(scalar.string("Approved workflow step id"), "Step ids approved for retry"),
  approvalReason: scalar.string("Optional human approval reason for approvedStepIds")
});

export const siteRegistryImportInput = objectSchema<{ path: string }>({ path: scalar.string("site_registry.json path") }, ["path"]);

export const siteCaptureMapInput = objectSchema<{ site: string; profile?: string; fixture?: string; url?: string }>({
  site: scalar.string("Site id"),
  profile: scalar.string("Browser profile"),
  fixture: scalar.string("Optional local fixture"),
  url: scalar.string("Optional site URL to open or prefer")
}, ["site"]);


export const webAiSendPromptInput = objectSchema<{ profile: string; prompt: string; model?: string; style?: string; tab_url_contains?: string; timeout_ms?: number; response_timeout_ms?: number; reuse_conversation?: boolean }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Prompt text to send"),
  model: scalar.string("Optional service-specific model hint"),
  style: scalar.string("Optional Claude style hint"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  response_timeout_ms: scalar.number("Maximum wait for model response completion in milliseconds; defaults to 120000"),
  reuse_conversation: scalar.boolean("ChatGPT only: continue the existing conversation instead of navigating to a fresh chat first")
}, ["profile", "prompt"]);


export const webAiSendPromptOutputShape = {
  response_text: scalar.string("Captured assistant response text; empty when completion_detected is false"),
  elapsed_ms: scalar.number("Total command elapsed time in milliseconds"),
  wait_ms: scalar.number("Milliseconds spent waiting for model response completion"),
  completion_detected: scalar.boolean("True only when service-specific completion signals were observed before the response timeout"),
  errorCode: scalar.string("Stable consumer error code or null at runtime"),
  error_code: scalar.string("Stable consumer error code on structured failure responses"),
  chat_url: scalar.string("Current conversation URL; ChatGPT conversation ids are not redacted"),
  conversation_id: scalar.string("ChatGPT/Claude conversation id when available"),
  model_used: scalar.string("Best-effort active model label when readable"),
  reuse_conversation: scalar.boolean("ChatGPT only: whether an existing conversation was reused"),
  ok: scalar.boolean("False on structured failure responses"),
  service: scalar.string("Service id on structured failure responses")
};

export const webAiUploadAndQueryInput = objectSchema<{ profile: string; files: string[]; prompt: string; tab_url_contains?: string; timeout_ms?: number }>({
  profile: scalar.string("Managed browser profile name"),
  files: scalar.array(scalar.string("Local file path"), "Files to upload"),
  prompt: scalar.string("Prompt text to send after upload"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds")
}, ["profile", "files", "prompt"]);

export const webAiGenerateFileInput = objectSchema<{ profile: string; prompt: string; expected_extension: string; download_dir: string; model?: string; artifact_class?: string; tab_url_contains?: string; timeout_ms?: number }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Prompt requesting a downloadable artifact"),
  expected_extension: scalar.enum(["py", "md", "csv", "docx", "pdf", "svg", "xlsx", "pptx", "html", "mmd"], "Expected file extension"),
  download_dir: scalar.string("Absolute directory for downloaded artifact"),
  model: scalar.string("Optional model hint"),
  artifact_class: scalar.enum(["code", "document"], "Claude artifact class"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds")
}, ["profile", "prompt", "expected_extension", "download_dir"]);

export const webAiGenerateImageInput = objectSchema<{ profile: string; prompt: string; download_dir: string; size?: string; tab_url_contains?: string; timeout_ms?: number }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Image generation prompt"),
  download_dir: scalar.string("Absolute directory for downloaded image"),
  size: scalar.string("Optional image size hint"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds")
}, ["profile", "prompt", "download_dir"]);

export const webAiCanvasToDocsInput = objectSchema<{ profile: string; prompt: string; title?: string; tab_url_contains?: string; timeout_ms?: number }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Canvas prompt to export to Google Docs"),
  title: scalar.string("Optional document title"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  response_timeout_ms: scalar.number("Maximum wait for model response completion in milliseconds; defaults to 120000"),
  reuse_conversation: scalar.boolean("ChatGPT only: continue the existing conversation instead of navigating to a fresh chat first")
}, ["profile", "prompt"]);

export const webAiGenerateVideoInput = objectSchema<{ profile: string; prompt: string; download_dir: string; duration_seconds?: number; timeout_ms?: number; tab_url_contains?: string }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Video generation prompt"),
  download_dir: scalar.string("Absolute directory for downloaded video"),
  duration_seconds: scalar.number("Optional duration: 2, 4, or 8"),
  timeout_ms: scalar.number("Maximum task runtime in milliseconds"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service")
}, ["profile", "prompt", "download_dir"]);

export const webAiTaskStatusInput = objectSchema<{ task_id: string }>({
  task_id: scalar.string("Task id returned by an async webai tool")
}, ["task_id"]);
