import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { objectSchema, scalar } from "../../../utils/schema";
import { safeOutput, ToolSpec } from "../../tools";

const DEFAULT_CODEX_PROFILE = "chatgpt";
const NOT_PROVISIONED_MESSAGE = "ChatGPT Codex requires a throwaway sandbox repository. Supply repo via the repo param after user provisioning.";

type CreateTaskArgs = { prompt: string; repo?: string; branch?: string; profile?: string };
type ProfileArgs = { profile?: string };
type TaskStatusArgs = { task_id: string; profile?: string };
type ListTasksArgs = { profile?: string; tab?: "active" | "code_reviews" | "archived" };

const createTaskInput = objectSchema<CreateTaskArgs>({
  prompt: scalar.string("ChatGPT Codex task prompt; not sent until sandbox provisioning exists"),
  repo: scalar.string("Throwaway sandbox repository to use after user provisioning"),
  branch: scalar.string("Sandbox repository branch to use after user provisioning"),
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: DEFAULT_CODEX_PROFILE }
}, ["prompt", "profile"]);

const listEnvsInput = objectSchema<ProfileArgs>({
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: DEFAULT_CODEX_PROFILE }
}, ["profile"]);

const taskStatusInput = objectSchema<TaskStatusArgs>({
  task_id: scalar.string("ChatGPT Codex task id"),
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: DEFAULT_CODEX_PROFILE }
}, ["task_id", "profile"]);

const listTasksInput = objectSchema<ListTasksArgs>({
  profile: { ...scalar.string("Managed ChatGPT browser profile"), default: DEFAULT_CODEX_PROFILE },
  tab: { ...scalar.enum(["active", "code_reviews", "archived"], "ChatGPT Codex task tab"), default: "active" }
}, ["profile"]);

function notProvisioned(): Record<string, unknown> {
  return safeOutput({
    status: "failed",
    errorCode: ConsumerErrorCodes.SUBMCP_NOT_PROVISIONED,
    message: NOT_PROVISIONED_MESSAGE
  });
}

export async function webAiChatgptCodexCreateTask(_args: any): Promise<Record<string, unknown>> {
  return notProvisioned();
}

export async function webAiChatgptCodexListEnvs(_args: any): Promise<Record<string, unknown>> {
  return notProvisioned();
}

export async function webAiChatgptCodexTaskStatus(_args: any): Promise<Record<string, unknown>> {
  return notProvisioned();
}

export async function webAiChatgptCodexListTasks(_args: any): Promise<Record<string, unknown>> {
  return notProvisioned();
}

export const chatgptCodexToolSpecs: ToolSpec[] = [
  {
    name: "webai_chatgpt_codex_create_task",
    description: "Placeholder ChatGPT Codex task creation; refuses until a throwaway sandbox repository is provisioned.",
    schema: createTaskInput,
    handler: async (args) => webAiChatgptCodexCreateTask(args)
  },
  {
    name: "webai_chatgpt_codex_list_envs",
    description: "Placeholder ChatGPT Codex environment listing; refuses until sandbox provisioning exists.",
    schema: listEnvsInput,
    handler: async (args) => webAiChatgptCodexListEnvs(args)
  },
  {
    name: "webai_chatgpt_codex_task_status",
    description: "Placeholder ChatGPT Codex task status lookup; refuses until sandbox provisioning exists.",
    schema: taskStatusInput,
    handler: async (args) => webAiChatgptCodexTaskStatus(args)
  },
  {
    name: "webai_chatgpt_codex_list_tasks",
    description: "Placeholder ChatGPT Codex task tab listing; refuses until sandbox provisioning exists.",
    schema: listTasksInput,
    handler: async (args) => webAiChatgptCodexListTasks(args)
  }
];
