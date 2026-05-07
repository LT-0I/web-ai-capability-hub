import { chatgptAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { WebAiAdapter } from "./types";

export const webAiAdapters: WebAiAdapter[] = [chatgptAdapter, claudeAdapter, geminiAdapter];

export function getWebAiAdapter(id: string): WebAiAdapter | undefined {
  return webAiAdapters.find((adapter) => adapter.id === id);
}

export function listWebAiAdapters(): WebAiAdapter[] {
  return webAiAdapters;
}
