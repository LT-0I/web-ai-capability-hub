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

export const browserReadInput = objectSchema<{ profile?: string; url?: string; screenshot?: boolean; includeAccessibility?: boolean; includePortals?: boolean }>({
  profile: scalar.string("Managed browser profile name"),
  url: scalar.string("Optional URL to open or prefer before reading"),
  screenshot: scalar.boolean("Capture a full-page screenshot"),
  includeAccessibility: scalar.boolean("Include accessibility-tree summary"),
  includePortals: scalar.boolean("Include body-level portal overlays such as Radix poppers, menus, dialogs, listboxes, and command palettes")
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

export const capabilityLibraryImportInput = objectSchema<{ path?: string }>({ path: scalar.string("capability-library.json path; defaults to docs/capability-library.json") }, []);

export const siteCaptureMapInput = objectSchema<{ site: string; profile?: string; fixture?: string; url?: string }>({
  site: scalar.string("Site id"),
  profile: scalar.string("Browser profile"),
  fixture: scalar.string("Optional local fixture"),
  url: scalar.string("Optional site URL to open or prefer")
}, ["site"]);


const webAiSendPromptBaseProps = {
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Prompt text to send"),
  model: scalar.string("Optional service-specific model tier to select before sending"),
  style: scalar.string("Optional Claude style hint"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  response_timeout_ms: scalar.number("Maximum wait for model response completion in milliseconds; defaults to 120000"),
  reuse_conversation: scalar.boolean("ChatGPT only: continue the existing conversation instead of navigating to a fresh chat first")
};

export const webAiSendPromptInput = objectSchema<{ profile: string; prompt: string; model?: string; style?: string; tab_url_contains?: string; timeout_ms?: number; response_timeout_ms?: number; reuse_conversation?: boolean; thinking?: boolean; web_search?: boolean; incognito?: boolean; canvas?: boolean }>({
  ...webAiSendPromptBaseProps,
  thinking: scalar.boolean("Claude/Gemini only: enable adaptive thinking / Thinking mode before sending"),
  web_search: scalar.boolean("Enable the service web-search mode before sending"),
  incognito: scalar.boolean("Claude only: start the prompt at https://claude.ai/new?incognito="),
  canvas: scalar.boolean("ChatGPT only: request canvas creation for this prompt")
}, ["profile", "prompt"]);

export const webAiChatgptSendPromptInput = objectSchema<{ profile: string; prompt: string; model?: string; web_search?: boolean; canvas?: boolean; tab_url_contains?: string; timeout_ms?: number; response_timeout_ms?: number; reuse_conversation?: boolean }>({
  profile: webAiSendPromptBaseProps.profile,
  prompt: webAiSendPromptBaseProps.prompt,
  model: webAiSendPromptBaseProps.model,
  web_search: scalar.boolean("Enable ChatGPT Web search mode before sending"),
  canvas: scalar.boolean("Request ChatGPT canvas creation for this prompt"),
  tab_url_contains: webAiSendPromptBaseProps.tab_url_contains,
  timeout_ms: webAiSendPromptBaseProps.timeout_ms,
  response_timeout_ms: webAiSendPromptBaseProps.response_timeout_ms,
  reuse_conversation: webAiSendPromptBaseProps.reuse_conversation
}, ["profile", "prompt"]);

export const webAiClaudeSendPromptInput = objectSchema<{ profile: string; prompt: string; model?: string; thinking?: boolean; web_search?: boolean; incognito?: boolean; style?: string; tab_url_contains?: string; timeout_ms?: number; response_timeout_ms?: number; backend?: "managed-cdp" | "extension-assisted-cdp" }>({
  profile: webAiSendPromptBaseProps.profile,
  prompt: webAiSendPromptBaseProps.prompt,
  model: webAiSendPromptBaseProps.model,
  thinking: scalar.boolean("Enable Claude Adaptive thinking before sending"),
  web_search: scalar.boolean("Enable Claude Web search before sending"),
  incognito: scalar.boolean("Start at https://claude.ai/new?incognito= before composing"),
  style: webAiSendPromptBaseProps.style,
  tab_url_contains: webAiSendPromptBaseProps.tab_url_contains,
  timeout_ms: webAiSendPromptBaseProps.timeout_ms,
  response_timeout_ms: webAiSendPromptBaseProps.response_timeout_ms,
  backend: scalar.enum(["managed-cdp", "extension-assisted-cdp"], "Browser backend for Claude prompt routing; defaults to managed-cdp")
}, ["profile", "prompt"]);

export const webAiGeminiSendPromptInput = objectSchema<{ profile: string; prompt: string; model?: string; thinking?: boolean; web_search?: boolean; tab_url_contains?: string; timeout_ms?: number; response_timeout_ms?: number; reuse_conversation?: boolean }>({
  profile: webAiSendPromptBaseProps.profile,
  prompt: webAiSendPromptBaseProps.prompt,
  model: webAiSendPromptBaseProps.model,
  thinking: scalar.boolean("Select Gemini Thinking mode before sending"),
  web_search: scalar.boolean("Enable Gemini Google Search before sending"),
  tab_url_contains: webAiSendPromptBaseProps.tab_url_contains,
  timeout_ms: webAiSendPromptBaseProps.timeout_ms,
  response_timeout_ms: webAiSendPromptBaseProps.response_timeout_ms,
  reuse_conversation: webAiSendPromptBaseProps.reuse_conversation
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

export const webAiUploadAndQueryInput = objectSchema<{ profile: string; files: string[]; prompt: string; model?: string; tab_url_contains?: string; timeout_ms?: number; response_timeout_ms?: number }>({
  profile: scalar.string("Managed browser profile name"),
  files: scalar.array(scalar.string("Local file path"), "Files to upload"),
  prompt: scalar.string("Prompt text to send after upload"),
  model: scalar.string("Optional service-specific model tier to select before sending"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  response_timeout_ms: scalar.number("Maximum wait for model response completion in milliseconds; defaults to 120000")
}, ["profile", "files", "prompt"]);

export const webAiClaudeUploadAndQueryInput = objectSchema<{ profile: string; files: string[]; prompt: string; model?: string; tab_url_contains?: string; timeout_ms?: number; response_timeout_ms?: number; backend?: "managed-cdp" | "extension-assisted-cdp" }>({
  profile: scalar.string("Managed browser profile name"),
  files: scalar.array(scalar.string("Local file path"), "Files to upload"),
  prompt: scalar.string("Prompt text to send after upload"),
  model: scalar.string("Optional service-specific model tier to select before sending"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  response_timeout_ms: scalar.number("Maximum wait for model response completion in milliseconds; defaults to 120000"),
  backend: scalar.enum(["managed-cdp", "extension-assisted-cdp"], "Browser backend for Claude upload routing; defaults to managed-cdp")
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

export const webAiClaudeGenerateFileInput = objectSchema<{ profile: string; prompt: string; expected_extension: string; download_dir: string; model?: string; artifact_class?: string; tab_url_contains?: string; timeout_ms?: number; backend?: "managed-cdp" | "extension-assisted-cdp" }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Prompt requesting a downloadable artifact"),
  expected_extension: scalar.enum(["py", "md", "csv", "docx", "pdf", "svg", "xlsx", "pptx", "html", "mmd"], "Expected file extension"),
  download_dir: scalar.string("Absolute directory for downloaded artifact"),
  model: scalar.string("Optional model hint"),
  artifact_class: scalar.enum(["code", "document"], "Claude artifact class"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  backend: scalar.enum(["managed-cdp", "extension-assisted-cdp"], "Browser backend for Claude generate-file routing; defaults to managed-cdp")
}, ["profile", "prompt", "expected_extension", "download_dir"]);

export const webAiGenerateImageInput = objectSchema<{ profile: string; prompt: string; download_dir: string; model?: string; size?: string; tab_url_contains?: string; timeout_ms?: number; reuse_conversation?: boolean; backend?: "managed-cdp" | "extension-assisted-cdp" }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Image generation prompt"),
  download_dir: scalar.string("Absolute directory for downloaded image"),
  model: scalar.string("Optional service-specific model tier to select before sending"),
  size: scalar.string("Optional image size hint"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  reuse_conversation: scalar.boolean("Gemini/ChatGPT: continue the existing conversation instead of navigating to a fresh chat first"),
  backend: scalar.enum(["managed-cdp", "extension-assisted-cdp"], "Browser backend for Gemini image generation perception; defaults to managed-cdp")
}, ["profile", "prompt", "download_dir"]);

export const webAiChatgptGenerateImageInput = objectSchema<{ profile: string; prompt: string; download_dir: string; model?: string; size?: string; tab_url_contains?: string; timeout_ms?: number; reuse_conversation?: boolean; backend?: "managed-cdp" | "extension-assisted-cdp" }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Image generation prompt"),
  download_dir: scalar.string("Absolute directory for downloaded image"),
  model: scalar.string("Optional service-specific model tier to select before sending"),
  size: scalar.string("Optional image size hint"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  reuse_conversation: scalar.boolean("Gemini/ChatGPT: continue the existing conversation instead of navigating to a fresh chat first"),
  backend: scalar.enum(["managed-cdp", "extension-assisted-cdp"], "Browser backend for ChatGPT image generation perception; defaults to managed-cdp")
}, ["profile", "prompt", "download_dir"]);

export const webAiCanvasToDocsInput = objectSchema<{ profile: string; prompt: string; model?: string; title?: string; tab_url_contains?: string; timeout_ms?: number; response_timeout_ms?: number; reuse_conversation?: boolean }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Canvas prompt to export to Google Docs"),
  model: scalar.string("Optional Gemini model tier to select before sending"),
  title: scalar.string("Optional document title"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  response_timeout_ms: scalar.number("Maximum wait for model response completion in milliseconds; defaults to 120000"),
  reuse_conversation: scalar.boolean("ChatGPT only: continue the existing conversation instead of navigating to a fresh chat first")
}, ["profile", "prompt"]);

export const webAiGenerateVideoInput = objectSchema<{ profile: string; prompt: string; download_dir: string; model?: string; account_pool?: string; duration_seconds?: number; timeout_ms?: number; tab_url_contains?: string; backend?: "managed-cdp" | "extension-assisted-cdp" }>({
  profile: scalar.string("Managed browser profile name"),
  prompt: scalar.string("Video generation prompt"),
  download_dir: scalar.string("Absolute directory for downloaded video"),
  model: scalar.string("Optional Gemini model tier to select before sending"),
  account_pool: scalar.string("Optional comma-separated Gemini profile names for Veo quota rotation"),
  duration_seconds: scalar.number("Optional duration: 2, 4, or 8"),
  timeout_ms: scalar.number("Maximum task runtime in milliseconds"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults internally per service"),
  backend: scalar.enum(["managed-cdp", "extension-assisted-cdp"], "Browser backend for Gemini video generation perception; defaults to managed-cdp")
}, ["profile", "prompt", "download_dir"]);

export const webAiChatgptCanvasExportInput = objectSchema<{ tab_url_contains: string; format?: string; download_dir?: string; profile?: string; timeout_ms?: number }>({
  tab_url_contains: scalar.string("Stable ChatGPT canvas conversation tab URL substring"),
  format: scalar.enum(["pdf", "docx", "md"], "Canvas export format; defaults to md"),
  download_dir: scalar.string("Absolute directory for downloaded canvas artifact; defaults to data/downloads"),
  profile: scalar.string("Managed browser profile name; defaults to WAH_DEFAULT_PROFILE/chatgpt for canvas export"),
  timeout_ms: scalar.number("Timeout in milliseconds")
}, ["tab_url_contains"]);


export const webAiChatgptPulseGetInput = objectSchema<{ profile: string; tab_id?: string; wait_ready?: boolean; timeout_ms?: number }>({
  profile: scalar.string("Managed browser profile name"),
  tab_id: scalar.string("Optional managed tab id; tool allocates/navigates to https://chatgpt.com/pulse"),
  wait_ready: scalar.boolean("Poll for pending Pulse to become ready until timeout_ms"),
  timeout_ms: scalar.number("Maximum wait in milliseconds when wait_ready is true; defaults to 0")
}, ["profile"]);

export const webAiChatgptPulseOnboardInput = objectSchema<{ profile: string; tab_id?: string; confirmed?: boolean }>({
  profile: scalar.string("Managed browser profile name"),
  tab_id: scalar.string("Optional managed tab id; tool allocates/navigates to https://chatgpt.com/pulse"),
  confirmed: scalar.boolean("Required true; Pulse onboarding is a durable account-state change")
}, ["profile", "confirmed"]);

export const webAiChatgptDeepResearchInput = objectSchema<{ prompt: string; profile: string; tab_url_contains?: string; timeout_ms?: number }>({
  prompt: scalar.string("Deep research prompt to send"),
  profile: scalar.string("Managed browser profile name"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults to ChatGPT"),
  timeout_ms: scalar.number("Timeout in milliseconds")
}, ["prompt", "profile"]);


export const webAiClaudeDeepResearchInput = objectSchema<{ prompt: string; profile: string; model?: string; tab_url_contains?: string; timeout_ms?: number }>({
  prompt: scalar.string("Claude Deep Research prompt to send"),
  profile: scalar.string("Managed browser profile name; defaults to claude-9224"),
  model: scalar.string("Optional Claude model tier to select before sending"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults to Claude"),
  timeout_ms: scalar.number("Timeout in milliseconds")
}, ["prompt", "profile"]);

export const webAiClaudeConversationManageInput = objectSchema<{ action: string; profile: string; query?: string; tab_url_contains?: string; confirmed?: boolean }>({
  action: scalar.enum(["search", "share", "sidebar_options"], "Claude conversation management action"),
  profile: scalar.string("Managed browser profile name; defaults to claude-9224"),
  query: scalar.string("Search query for search action"),
  tab_url_contains: scalar.string("Optional stable conversation tab URL substring for share action"),
  confirmed: scalar.boolean("Required true for opening Claude share controls")
}, ["action", "profile"]);

export const webAiClaudeWorkspaceInput = objectSchema<{ surface: string; profile: string }>({
  surface: scalar.enum(["projects", "integrations", "skills", "appearance", "style_presets"], "Claude workspace/settings surface to inspect"),
  profile: scalar.string("Managed browser profile name; defaults to claude-9224")
}, ["surface", "profile"]);

export const webAiChatgptConversationManageInput = objectSchema<{ action: string; profile: string; tab_url_contains?: string; surface?: string; query?: string }>({
  action: scalar.enum(["share", "navigate_settings", "rename", "delete", "archive", "search", "menu_enumerate"], "Conversation management action; menu_enumerate uses the in-chat header options button and search uses Control+k; destructive actions return HUMAN_HANDOFF_REQUIRED"),
  profile: scalar.string("Managed browser profile name"),
  tab_url_contains: scalar.string("Optional stable conversation tab URL substring for share/menu actions"),
  surface: scalar.enum(["personalization", "data_controls", "schedules"], "Settings surface for navigate_settings"),
  query: scalar.string("Search query for Control+k conversation search")
}, ["action", "profile"]);

export const webAiChatgptWorkspaceInput = objectSchema<{ surface: string; profile: string; action?: string }>({
  surface: scalar.enum(["projects", "gpts", "tasks", "apps", "memory", "personalization", "data_controls"], "ChatGPT workspace/settings surface to inspect"),
  profile: scalar.string("Managed browser profile name"),
  action: scalar.enum(["read", "delete", "delete_memory", "grant_oauth", "create"], "Optional action; destructive/mutating actions return POLICY_APPROVAL_REQUIRED")
}, ["surface", "profile"]);


export const webAiGeminiDeepResearchInput = objectSchema<{ prompt: string; profile: string; confirmed?: boolean; tab_url_contains?: string; timeout_ms?: number }>({
  prompt: scalar.string("Gemini Deep research prompt to send"),
  profile: scalar.string("Managed browser profile name; defaults to gemini-9225"),
  confirmed: scalar.boolean("Required true to submit the prompt through the Send message confirmation path"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults to Gemini"),
  timeout_ms: scalar.number("Timeout in milliseconds")
}, ["prompt", "profile"]);

export const webAiGeminiCanvasEditInput = objectSchema<{ prompt?: string; edit_text?: string; ai_action?: string; profile: string; tab_url_contains?: string; confirmed?: boolean; timeout_ms?: number; response_timeout_ms?: number }>({
  prompt: scalar.string("Optional substantial prompt used to open a Gemini Canvas"),
  edit_text: scalar.string("Optional text to type directly into the Gemini Canvas body"),
  ai_action: scalar.enum(["length", "tone", "suggest"], "Optional Gemini Canvas AI edit action"),
  profile: scalar.string("Managed browser profile name; defaults to gemini-9225"),
  tab_url_contains: scalar.string("Optional stable tab URL substring; defaults to Gemini"),
  confirmed: scalar.boolean("Required true when prompt submission is requested"),
  timeout_ms: scalar.number("Timeout in milliseconds"),
  response_timeout_ms: scalar.number("Maximum wait for Canvas ready controls")
}, ["profile"]);

export const webAiGeminiConversationManageInput = objectSchema<{ action: string; profile: string; tab_url_contains?: string; query?: string; confirmed?: boolean }>({
  action: scalar.enum(["menu_enumerate", "share", "search", "delete", "rename"], "Gemini conversation management action; mutating actions return POLICY_APPROVAL_REQUIRED"),
  profile: scalar.string("Managed browser profile name; defaults to gemini-9225"),
  tab_url_contains: scalar.string("Optional stable conversation tab URL substring for menu/share actions"),
  query: scalar.string("Search query for search action"),
  confirmed: scalar.boolean("Required true for opening Gemini share controls")
}, ["action", "profile"]);

export const webAiGeminiWorkspaceInput = objectSchema<{ surface: string; profile: string }>({
  surface: scalar.enum(["gems", "scheduled", "study", "audio_overview", "workspace_integration", "connected_apps", "personalization"], "Gemini workspace/settings surface to inspect"),
  profile: scalar.string("Managed browser profile name; defaults to gemini-9225")
}, ["surface", "profile"]);

export const webAiTaskStatusInput = objectSchema<{ task_id: string }>({
  task_id: scalar.string("Task id returned by an async webai tool")
}, ["task_id"]);

export const generatedManifestInput = objectSchema<Record<string, unknown>>({}, []);
export const generatedManifestOutput = objectSchema<Record<string, unknown>>({}, []);
