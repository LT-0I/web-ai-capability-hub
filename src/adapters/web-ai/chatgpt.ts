import { WebAiAdapter } from "./types";

export const chatgptAdapter: WebAiAdapter = {
  id: "chatgpt",
  kind: "web-ai",
  displayName: "ChatGPT Web",
  baseUrl: "https://chatgpt.com/",
  recommendedProfile: "chatgpt",
  loginStateHints: ["composer textbox visible", "new chat control visible", "account menu visible", "login/sign-up buttons absent"],
  defaultDiscoveryPaths: ["https://chatgpt.com/"],
  knownCapabilityCategories: ["chat", "files", "image-generation", "mode-selection", "workspace", "download", "navigation"],
  semanticAnchors: [
    { id: "promptBox", role: "textbox", names: ["message", "prompt", "ask anything", "消息", "提问", "询问 ChatGPT", "向 ChatGPT 提问"], selectors: ["textarea", "[contenteditable='true']"] },
    { id: "sendButton", role: "button", names: ["send", "submit", "发送", "发送消息", "提交"], selectors: ["button[aria-label*='Send' i]"] },
    { id: "upload", role: "button", names: ["upload", "attach", "file", "上传", "附加", "文件", "添加文件"] },
    { id: "modelSelector", role: "button", names: ["model", "GPT", "模型", "切换模型"] },
    { id: "cancel", role: "button", names: ["cancel", "取消"] },
    { id: "close", role: "button", names: ["close", "关闭", "×"] }
  ],
  safeDraftActions: ["read page", "open menu", "type draft without sending", "clear draft"]
};
