export type ActionKind = "open" | "observe" | "click" | "type" | "press" | "select" | "upload" | "waitFor" | "extract" | "download" | "assert" | "screenshot" | "humanPrompt";

export interface RunEvent {
  runId: string;
  manifestId: string;
  action: ActionKind;
  status: "started" | "succeeded" | "failed" | "handoff";
  ts: string;
  payload?: Record<string, unknown>;
}

export interface ActionContext {
  runId: string;
  manifestId: string;
  page?: any;
  emit?: (event: RunEvent) => void | Promise<void>;
}

function now(): string { return new Date().toISOString(); }
async function emit(ctx: ActionContext, action: ActionKind, status: RunEvent["status"], payload?: Record<string, unknown>): Promise<void> {
  await ctx.emit?.({ runId: ctx.runId, manifestId: ctx.manifestId, action, status, ts: now(), payload });
}

export const actionDsl = {
  async open(ctx: ActionContext, url: string): Promise<unknown> { await emit(ctx, "open", "started", { url }); await ctx.page?.goto?.(url, { waitUntil: "domcontentloaded" }); await emit(ctx, "open", "succeeded", { url: ctx.page?.url?.() || url }); return { url: ctx.page?.url?.() || url }; },
  async observe(ctx: ActionContext): Promise<unknown> { await emit(ctx, "observe", "started"); const title = await ctx.page?.title?.().catch(() => ""); const url = ctx.page?.url?.() || ""; await emit(ctx, "observe", "succeeded", { url, title }); return { url, title }; },
  async click(ctx: ActionContext, selector: string): Promise<void> { await emit(ctx, "click", "started", { selector }); await ctx.page?.locator?.(selector).first?.().click?.(); await emit(ctx, "click", "succeeded", { selector }); },
  async type(ctx: ActionContext, selector: string, text: string): Promise<void> { await emit(ctx, "type", "started", { selector }); await ctx.page?.locator?.(selector).first?.().fill?.(text); await emit(ctx, "type", "succeeded", { selector }); },
  async press(ctx: ActionContext, key: string): Promise<void> { await emit(ctx, "press", "started", { key }); await ctx.page?.keyboard?.press?.(key); await emit(ctx, "press", "succeeded", { key }); },
  async select(ctx: ActionContext, selector: string, value: string): Promise<void> { await emit(ctx, "select", "started", { selector, value }); await ctx.page?.locator?.(selector).first?.().selectOption?.(value); await emit(ctx, "select", "succeeded", { selector }); },
  async upload(ctx: ActionContext, selector: string, files: string[]): Promise<void> { await emit(ctx, "upload", "started", { selector, count: files.length }); await ctx.page?.locator?.(selector).first?.().setInputFiles?.(files); await emit(ctx, "upload", "succeeded", { selector, count: files.length }); },
  async waitFor(ctx: ActionContext, selector: string, timeout = 15000): Promise<void> { await emit(ctx, "waitFor", "started", { selector, timeout }); await ctx.page?.waitForSelector?.(selector, { timeout }); await emit(ctx, "waitFor", "succeeded", { selector }); },
  async extract(ctx: ActionContext, selector = "body"): Promise<string> { await emit(ctx, "extract", "started", { selector }); const text = await ctx.page?.locator?.(selector).innerText?.().catch(() => "") || ""; await emit(ctx, "extract", "succeeded", { selector, bytes: text.length }); return text; },
  async download(ctx: ActionContext): Promise<void> { await emit(ctx, "download", "handoff", { reason: "download orchestration is handled by artifactClick" }); },
  async assert(ctx: ActionContext, condition: boolean, message: string): Promise<void> { await emit(ctx, "assert", "started", { message }); if (!condition) throw new Error(message); await emit(ctx, "assert", "succeeded", { message }); },
  async screenshot(ctx: ActionContext, path?: string): Promise<unknown> { await emit(ctx, "screenshot", "started", { path }); const result = await ctx.page?.screenshot?.(path ? { path } : undefined); await emit(ctx, "screenshot", "succeeded", { path }); return result; },
  async humanPrompt(ctx: ActionContext, prompt: string): Promise<unknown> { await emit(ctx, "humanPrompt", "handoff", { prompt }); return { status: "human_handoff", prompt }; }
};
