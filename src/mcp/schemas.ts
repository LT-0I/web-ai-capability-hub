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
