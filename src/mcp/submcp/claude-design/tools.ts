import { objectSchema, scalar } from "../../../utils/schema";
import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { BrowserToolRuntime, ToolSpec } from "../../tools";
import { stepCreateProject, stepGenerate, stepGetHtml, stepPresent, SubMcpQuotaExhaustedError } from "./flow";

const DEFAULT_DESIGN_PROFILE = "claude-9224";

const createProjectInput = objectSchema<{ name: string; fidelity?: "wireframe" | "high_fidelity"; profile?: string }>({
  name: scalar.string("Claude Design project name"),
  fidelity: { ...scalar.enum(["wireframe", "high_fidelity"], "Design fidelity"), default: "high_fidelity" },
  profile: { ...scalar.string("Managed Claude Design browser profile"), default: DEFAULT_DESIGN_PROFILE }
}, ["name", "profile"]);

const generateInput = objectSchema<{ prompt: string; project_url: string; model?: "sonnet" | "haiku"; profile?: string; timeout_ms?: number }>({
  prompt: scalar.string("Design generation prompt"),
  project_url: scalar.string("Claude Design project URL"),
  model: { ...scalar.enum(["sonnet", "haiku"], "Claude Design model tier; Opus is intentionally unsupported"), default: "sonnet" },
  profile: { ...scalar.string("Managed Claude Design browser profile"), default: DEFAULT_DESIGN_PROFILE },
  timeout_ms: scalar.number("Generation timeout in milliseconds")
}, ["prompt", "project_url", "profile"]);

const getHtmlInput = objectSchema<{ project_url: string; download_dir?: string; profile?: string }>({
  project_url: scalar.string("Claude Design project URL"),
  download_dir: scalar.string("Directory where the iframe artifact descriptor is saved"),
  profile: { ...scalar.string("Managed Claude Design browser profile"), default: DEFAULT_DESIGN_PROFILE }
}, ["project_url", "profile"]);

const presentInput = objectSchema<{ project_url: string; profile?: string }>({
  project_url: scalar.string("Claude Design project URL"),
  profile: { ...scalar.string("Managed Claude Design browser profile"), default: DEFAULT_DESIGN_PROFILE }
}, ["project_url", "profile"]);

function withDefaultProfile<T extends Record<string, unknown>>(args: T): T & { profile: string } {
  return { ...args, profile: String(args.profile || DEFAULT_DESIGN_PROFILE) };
}

function projectIdFromUrl(projectUrl: string): string | null {
  try { return /\/design\/p\/([^/?#]+)/.exec(new URL(projectUrl).pathname)?.[1] || null; }
  catch { return /\/design\/p\/([^/?#]+)/.exec(projectUrl)?.[1] || null; }
}

function quotaResponse(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ok: false, errorCode: ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED, error_code: ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED, ...extra };
}

function isQuotaError(error: any): boolean {
  return error instanceof SubMcpQuotaExhaustedError || error?.errorCode === ConsumerErrorCodes.SUBMCP_QUOTA_EXHAUSTED || /SUBMCP_QUOTA_EXHAUSTED|quota/i.test(error?.message || "");
}

function stableDesignErrorCode(error: any): string | null {
  const message = String(error?.message || error || "");
  if (error?.errorCode && (ConsumerErrorCodes as any)[error.errorCode]) return error.errorCode;
  if (/IFRAME_NOT_FOUND/.test(message)) return ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  if (/waitForSelector|waiting for selector|Timeout .*exceeded|timed out/i.test(message)) return ConsumerErrorCodes.ELEMENT_NOT_FOUND;
  if (/COMMAND_TIMEOUT|waitForURL|did not finish|POSTCONDITION_TIMEOUT/i.test(message)) return ConsumerErrorCodes.POSTCONDITION_TIMEOUT;
  return null;
}

function designFailure(error: any, extra: Record<string, unknown> = {}): Record<string, unknown> | null {
  const code = stableDesignErrorCode(error);
  if (!code) return null;
  return { ok: false, errorCode: code, error_code: code, ...extra };
}

export async function webAiClaudeDesignCreateProject(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  try {
    const result = await stepCreateProject(runtime, effective as any);
    return { ...result, projectId: projectIdFromUrl(result.projectUrl) };
  } catch (error: any) {
    if (isQuotaError(error)) return quotaResponse({ projectUrl: "", projectId: null });
    const stable = designFailure(error, { projectUrl: "", projectId: null });
    if (stable) return stable;
    throw error;
  }
}

export async function webAiClaudeDesignGenerate(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  const modelUsed = String(effective.model || "sonnet");
  const failureEnvelope = (error?: any) => ({
    status: "failed",
    model_used: modelUsed,
    projectUrl: String(error?.projectUrl || effective.project_url || ""),
    fileName: String(error?.fileName || "")
  });
  try {
    const result = await stepGenerate(runtime, effective as any);
    return { status: "generated", model_used: result.model_used, projectUrl: result.projectUrl, fileName: result.fileName };
  } catch (error: any) {
    if (isQuotaError(error)) return quotaResponse(failureEnvelope(error));
    const stable = designFailure(error, failureEnvelope(error));
    if (stable) return stable;
    throw error;
  }
}

export async function webAiClaudeDesignGetHtml(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  try {
    return await stepGetHtml(runtime, effective as any);
  } catch (error: any) {
    if (isQuotaError(error)) return quotaResponse({ iframeArtifactSha256: "", savedPath: "", byteSize: 0 });
    const stable = designFailure(error, { iframeArtifactSha256: "", savedPath: "", byteSize: 0 });
    if (stable) return stable;
    throw error;
  }
}

export async function webAiClaudeDesignPresent(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  try {
    return await stepPresent(runtime, effective as any);
  } catch (error: any) {
    if (isQuotaError(error)) return quotaResponse({ presentUrl: "" });
    const stable = designFailure(error, { presentUrl: "" });
    if (stable) return stable;
    throw error;
  }
}

export const claudeDesignToolSpecs: ToolSpec[] = [
  {
    name: "webai_claude_design_create_project",
    description: "Create a Claude Design project in the in-process claude-design sub-MCP module.",
    schema: createProjectInput,
    handler: async (args, runtime) => webAiClaudeDesignCreateProject(args, runtime)
  },
  {
    name: "webai_claude_design_generate",
    description: "Generate a Claude Design artifact with Sonnet or Haiku only, waiting for the real /serve/<name>.html iframe readiness signal; Opus is intentionally unsupported.",
    schema: generateInput,
    handler: async (args, runtime) => webAiClaudeDesignGenerate(args, runtime)
  },
  {
    name: "webai_claude_design_get_html",
    description: "Save and fingerprint verified real Claude Design HTML viewer markup without returning raw HTML; bootstrap/loader stubs fail artifact verification.",
    schema: getHtmlInput,
    handler: async (args, runtime) => webAiClaudeDesignGetHtml(args, runtime)
  },
  {
    name: "webai_claude_design_present",
    description: "Open Claude Design Present mode and return the spawned presentation URL.",
    schema: presentInput,
    handler: async (args, runtime) => webAiClaudeDesignPresent(args, runtime)
  }
];
