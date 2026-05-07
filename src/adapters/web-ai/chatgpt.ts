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
    { id: "promptBox", role: "textbox", names: ["message", "prompt", "ask anything"], selectors: ["textarea", "[contenteditable='true']"] },
    { id: "sendButton", role: "button", names: ["send", "submit"], selectors: ["button[aria-label*='Send' i]"] },
    { id: "upload", role: "button", names: ["upload", "attach", "file"] },
    { id: "modelSelector", role: "button", names: ["model", "GPT"] }
  ],
  safeDraftActions: ["read page", "open menu", "type draft without sending", "clear draft"]
};
