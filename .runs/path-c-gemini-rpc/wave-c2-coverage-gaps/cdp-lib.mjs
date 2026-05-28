// Minimal CDP-over-WebSocket helper for wave-c2 capture/probe scripts (Gemini port 9225).
export async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", () => reject(new Error("ws error")), { once: true });
  });
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.addEventListener("message", (ev) => {
    let m;
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method && handlers.has(m.method)) handlers.get(m.method).forEach((h) => { try { h(m.params); } catch {} });
  });
  function send(method, params = {}) {
    const reqId = ++id;
    ws.send(JSON.stringify({ id: reqId, method, params }));
    return new Promise((resolve, reject) => pending.set(reqId, (msg) => msg.error ? reject(new Error(method + " " + JSON.stringify(msg.error))) : resolve(msg.result)));
  }
  function on(event, handler) {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event).push(handler);
  }
  return { send, on, close: () => ws.close() };
}

export async function pickGeminiAppPage(port = 9225, re = /gemini\.google\.com\/app/) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  return pages.find((p) => p.type === "page" && re.test(p.url || ""));
}

export async function evalExpr(session, expression, awaitPromise = true) {
  const r = await session.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  return r.result?.value;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
