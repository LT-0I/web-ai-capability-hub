import { WebAiAdapter } from "./types";

export const geminiAdapter: WebAiAdapter = {
  id: "gemini",
  kind: "web-ai",
  displayName: "Gemini Web",
  baseUrl: "https://gemini.google.com/app",
  recommendedProfile: "gemini",
  loginStateHints: ["prompt composer visible", "Gemini model selector visible", "Google account controls visible", "sign-in prompt absent"],
  defaultDiscoveryPaths: ["https://gemini.google.com/app"],
  knownCapabilityCategories: ["chat", "files", "image-generation", "mode-selection", "workspace", "download", "navigation"],
  semanticAnchors: [
    { id: "promptBox", role: "textbox", names: ["enter a prompt", "prompt", "message"], selectors: ["textarea", "[contenteditable='true']"] },
    { id: "sendButton", role: "button", names: ["send"] },
    { id: "upload", role: "button", names: ["upload", "add", "file", "image"] },
    { id: "imageGeneration", role: "button", names: ["image", "imagen", "generate image"] },
    { id: "modelSelector", role: "button", names: ["model", "Gemini"] }
  ],
  safeDraftActions: ["read page", "open image generation menu", "type prompt draft", "verify draft", "clear draft"]
};
