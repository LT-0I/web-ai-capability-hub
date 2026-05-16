import { claudeDesignToolSpecs } from "./claude-design/tools";
import { geminiMusicToolSpecs } from "./gemini-music/tools";
import { chatgptCodexToolSpecs } from "./chatgpt-codex/tools";

export const subMcpToolSpecs = [
  ...claudeDesignToolSpecs,
  ...geminiMusicToolSpecs,
  ...chatgptCodexToolSpecs
];
