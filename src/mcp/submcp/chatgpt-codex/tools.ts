import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { objectSchema, scalar } from "../../../utils/schema";
import { BrowserToolRuntime, safeOutput, ToolSpec, withManagedPage } from "../../tools";
import {
  CODEX_ALLOWED_ENV_ID,
  CODEX_ALLOWED_ENV_NAME,
  CODEX_ALLOWED_REPO,
  CODEX_COMPOSER_SELECTOR,
  CODEX_ENVS_URL,
  CODEX_SUBMIT_SELECTOR,
  CODEX_URL,
  allowlistError,
  assertTaskId,
  contractError,
  extractSubmittedTaskId,
  fillLocator,
  listAllowedEnvsFromPage,
  notProvisioned,
  readCodexDiff,
  readCodexStatus,
  readTopTaskCardId,
  selectAllowedEnvForSubmit,
  taskUrl
} from "./flow";

const DEFAULT_CODEX_PROFILE = "chatgpt";

type SubmitTaskArgs = { prompt: string; repo?: string; branch?: string; profile?: string; confirmed?: boolean };
type ProfileArgs = { profile?: string };
type TaskStatusArgs = { task_id: string; profile?: string };
type GetDiffArgs = { task_id: string; profile?: string };

const submitTaskInput = objectSchema<SubmitTaskArgs>({
  prompt: scalar.string("ChatGPT Codex task prompt; submitted only to the allowlisted LT-0I/CN- environment"),
  repo: scalar.string("Must be LT-0I/CN- when supplied; other repositories are refused"),
  branch: scalar.string("Optional branch selected in the already-bound LT-0I/CN- environment"),
  confirmed: { ...scalar.boolean("Required true to submit the Codex task"), default: false },
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: DEFAULT_CODEX_PROFILE }
}, ["prompt", "profile"]);

const listEnvsInput = objectSchema<ProfileArgs>({
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: DEFAULT_CODEX_PROFILE }
}, ["profile"]);

const taskStatusInput = objectSchema<TaskStatusArgs>({
  task_id: scalar.string("ChatGPT Codex task id"),
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: DEFAULT_CODEX_PROFILE }
}, ["task_id", "profile"]);

const getDiffInput = objectSchema<GetDiffArgs>({
  task_id: scalar.string("ChatGPT Codex task id whose completed LT-0I/CN- diff should be read"),
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: DEFAULT_CODEX_PROFILE }
}, ["task_id", "profile"]);

function withDefaultProfile<T extends Record<string, unknown>>(args: T): T & { profile: string } {
  return { ...args, profile: String(args.profile || DEFAULT_CODEX_PROFILE) };
}

function repoGuard(repo?: unknown): Record<string, unknown> | null {
  if (repo === undefined || repo === null || String(repo).trim() === "") return null;
  return String(repo).trim() === CODEX_ALLOWED_REPO ? null : allowlistError(`ChatGPT Codex refused repo '${String(repo)}'; only ${CODEX_ALLOWED_REPO} is allowlisted.`);
}

function handleCodexError(error: any): Record<string, unknown> {
  const codeFromError = error?.errorCode || error?.error_code;
  const errorCode = (Object.values(ConsumerErrorCodes) as string[]).includes(codeFromError) ? codeFromError : ConsumerErrorCodes.UNKNOWN;
  return contractError(errorCode, error?.message || "ChatGPT Codex sub-MCP operation failed");
}

export async function webAiChatgptCodexSubmitTask(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  if (!effective.confirmed) {
    return safeOutput(contractError(ConsumerErrorCodes.SENSITIVE_CONTENT_GUARD, "ChatGPT Codex submit-task requires confirmed=true before clicking Submit.", { action: "chatgpt_codex_submit_task" }));
  }
  const repoRefusal = repoGuard(effective.repo);
  if (repoRefusal) return safeOutput(repoRefusal);
  try {
    return safeOutput(await withManagedPage({ ...effective, __requireTargetSurface: true }, runtime, CODEX_URL, async (page) => {
      await page.goto?.(CODEX_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      const selectedError = await selectAllowedEnvForSubmit(page);
      if (selectedError) return selectedError;
      await fillLocator(page, CODEX_COMPOSER_SELECTOR, String(effective.prompt || ""));
      await page.waitForSelector?.(CODEX_SUBMIT_SELECTOR, { state: "visible", timeout: 15000 }).catch(() => undefined);
      // Capture the current top task-list card id BEFORE clicking Submit so we
      // can wait for the genuinely-new card (which differs from this id) rather
      // than capturing the stale previous-run card.
      const preSubmitTopId = await readTopTaskCardId(page);
      const submit = page.locator(CODEX_SUBMIT_SELECTOR).first?.() || page.locator(CODEX_SUBMIT_SELECTOR);
      await submit.click();
      const taskId = await extractSubmittedTaskId(page, preSubmitTopId);
      if (!taskId) return contractError(ConsumerErrorCodes.POSTCONDITION_TIMEOUT, "ChatGPT Codex submit did not expose a task_e_* task id after Submit.");
      return { task_id: taskId, task_url: taskUrl(taskId), repo: CODEX_ALLOWED_REPO, env: CODEX_ALLOWED_ENV_NAME, env_id: CODEX_ALLOWED_ENV_ID, status: "submitted" };
    }));
  } catch (error) { return safeOutput(handleCodexError(error)); }
}

export async function webAiChatgptCodexListEnvs(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  try {
    return safeOutput(await withManagedPage({ ...effective, __requireTargetSurface: true }, runtime, CODEX_ENVS_URL, async (page) => {
      const envs = await listAllowedEnvsFromPage(page);
      if (!envs.length) return notProvisioned();
      return { status: "ok", envs };
    }));
  } catch (error) { return safeOutput(handleCodexError(error)); }
}

export async function webAiChatgptCodexTaskStatus(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  try { assertTaskId(String(effective.task_id)); }
  catch (error) { return safeOutput(handleCodexError(error)); }
  try {
    return safeOutput(await withManagedPage({ ...effective, __requireTargetSurface: true }, runtime, taskUrl(String(effective.task_id)), async (page) => {
      await page.goto?.(taskUrl(String(effective.task_id)), { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      return readCodexStatus(page, String(effective.task_id));
    }));
  } catch (error) { return safeOutput(handleCodexError(error)); }
}

export async function webAiChatgptCodexGetDiff(args: any, runtime: Required<BrowserToolRuntime>): Promise<Record<string, unknown>> {
  const effective = withDefaultProfile(args);
  try { assertTaskId(String(effective.task_id)); }
  catch (error) { return safeOutput(handleCodexError(error)); }
  try {
    return safeOutput(await withManagedPage({ ...effective, __requireTargetSurface: true }, runtime, taskUrl(String(effective.task_id)), async (page) => {
      await page.goto?.(taskUrl(String(effective.task_id)), { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState?.("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      return readCodexDiff(page, String(effective.task_id));
    }));
  } catch (error) { return safeOutput(handleCodexError(error)); }
}

// Backwards-compatible TypeScript export names retained for downstream imports;
// registered MCP/CLI names below follow the live Codex recipe: submit-task/get-diff.
export const webAiChatgptCodexCreateTask = webAiChatgptCodexSubmitTask;
export const webAiChatgptCodexListTasks = webAiChatgptCodexGetDiff;

export const chatgptCodexToolSpecs: ToolSpec[] = [
  {
    name: "webai_chatgpt_codex_submit_task",
    description: "Submit a confirmed ChatGPT Codex task to the hard-allowlisted LT-0I/CN- environment and return the task id.",
    schema: submitTaskInput,
    handler: async (args, runtime) => webAiChatgptCodexSubmitTask(args, runtime)
  },
  {
    name: "webai_chatgpt_codex_list_envs",
    description: "List only the hard-allowlisted ChatGPT Codex LT-0I/CN- environment; return SUBMCP_NOT_PROVISIONED if absent.",
    schema: listEnvsInput,
    handler: async (args, runtime) => webAiChatgptCodexListEnvs(args, runtime)
  },
  {
    name: "webai_chatgpt_codex_task_status",
    description: "Read a ChatGPT Codex task status only when the task page proves LT-0I/CN- ownership.",
    schema: taskStatusInput,
    handler: async (args, runtime) => webAiChatgptCodexTaskStatus(args, runtime)
  },
  {
    name: "webai_chatgpt_codex_get_diff",
    description: "Read the completed ChatGPT Codex unified diff for an allowlisted LT-0I/CN- task without clicking Create PR or other publish controls.",
    schema: getDiffInput,
    handler: async (args, runtime) => webAiChatgptCodexGetDiff(args, runtime)
  }
];
