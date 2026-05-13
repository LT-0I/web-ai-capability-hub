import { WebAiAdapter } from "./types";

export const claudeAdapter: WebAiAdapter = {
  id: "claude",
  kind: "web-ai",
  displayName: "Claude Web",
  baseUrl: "https://claude.ai/",
  recommendedProfile: "claude",
  loginStateHints: ["composer visible", "project or recents navigation visible", "sign-in controls absent"],
  defaultDiscoveryPaths: ["https://claude.ai/"],
  knownCapabilityCategories: ["chat", "files", "workspace", "mode-selection", "download", "navigation"],
  semanticAnchors: [
    { id: "promptBox", role: "textbox", names: ["message", "prompt", "talk to Claude", "消息", "提示词", "和 Claude 对话", "输入提示"], selectors: ["textarea", "[contenteditable='true']"] },
    { id: "sendButton", role: "button", names: ["send", "发送", "提交"] },
    { id: "projectSelector", role: "button", names: ["project", "workspace", "项目", "工作区"] },
    { id: "artifactPanel", role: "region", names: ["artifact", "工件", "产物", "Artifact"] },
    { id: "close", role: "button", names: ["close", "关闭"] }
  ],
  safeDraftActions: ["read page", "open project menu", "type draft without sending", "clear draft"]
};
