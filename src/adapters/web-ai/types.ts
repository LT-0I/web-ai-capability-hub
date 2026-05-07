export interface WebAiAdapter {
  id: "chatgpt" | "claude" | "gemini" | string;
  kind: "web-ai";
  displayName: string;
  baseUrl: string;
  recommendedProfile: string;
  loginStateHints: string[];
  defaultDiscoveryPaths: string[];
  knownCapabilityCategories: string[];
  semanticAnchors: Array<{ id: string; role?: string; names: string[]; selectors?: string[]; description?: string }>;
  safeDraftActions: string[];
}
