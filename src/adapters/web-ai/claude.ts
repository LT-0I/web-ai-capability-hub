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
    { id: "promptBox", role: "textbox", names: ["message", "prompt", "talk to Claude"], selectors: ["textarea", "[contenteditable='true']"] },
    { id: "sendButton", role: "button", names: ["send"] },
    { id: "projectSelector", role: "button", names: ["project", "workspace"] },
    { id: "artifactPanel", role: "region", names: ["artifact"] }
  ],
  safeDraftActions: ["read page", "open project menu", "type draft without sending", "clear draft"]
};
