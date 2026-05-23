import { optionalRequire } from "../utils/optionalRequire";
import { callMcpTool, listMcpTools } from "./tools";
import { listMcpResources, readMcpResource } from "./resources";
import { BrowserSessionManager } from "../browser/sessionManager";
import { ManagedBrowserLauncher } from "../browser/managedLauncher";
import { createManagedBrowserLauncher } from "../runtime/pool/profilePool";
import { CapabilityDatabase } from "../capabilities/database";
import { ConfirmationRequiredError } from "../actions/confirmationPolicy";

const fs = require("node:fs");
const path = require("node:path");

function packageMetadata(): { name: string; version: string } {
  const candidates = [
    path.resolve(__dirname, "../../../package.json"),
    path.resolve(__dirname, "../../package.json"),
    path.resolve(process.cwd(), "package.json")
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const parsed = JSON.parse(fs.readFileSync(candidate, "utf-8"));
    if (typeof parsed.name === "string" && typeof parsed.version === "string") {
      return { name: parsed.name, version: parsed.version };
    }
  }
  throw new Error("Unable to read MCP server package metadata from package.json.");
}

export function serializeMcpToolError(error: unknown): Record<string, unknown> | undefined {
  const candidate = error as Partial<ConfirmationRequiredError> & { name?: string; action?: unknown; reason?: unknown };
  if (!(error instanceof ConfirmationRequiredError) && candidate?.name !== "ConfirmationRequiredError") return undefined;
  return {
    ok: false,
    status: "approval_required",
    requiredFor: candidate.action,
    reason: typeof candidate.reason === "string" ? candidate.reason : "Human confirmation required before this browser action"
  };
}

export async function startMcpServer(): Promise<void> {
  const sdkServer = optionalRequire<any>("@modelcontextprotocol/sdk/server/index.js");
  const sdkStdio = optionalRequire<any>("@modelcontextprotocol/sdk/server/stdio.js");
  const sdkTypes = optionalRequire<any>("@modelcontextprotocol/sdk/types.js");
  if (!sdkServer || !sdkStdio || !sdkTypes) {
    throw new Error("@modelcontextprotocol/sdk is not installed. Run `npm install` before starting the MCP server.");
  }
  const { Server } = sdkServer;
  const { StdioServerTransport } = sdkStdio;
  const { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } = sdkTypes;
  const runtime = { session: new BrowserSessionManager(), launcher: createManagedBrowserLauncher(), database: new CapabilityDatabase() };
  const server = new Server(packageMetadata(), { capabilities: { tools: {}, resources: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listMcpTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    let result: unknown;
    try {
      result = await callMcpTool(request.params.name, request.params.arguments || {}, runtime);
    } catch (error) {
      const serialized = serializeMcpToolError(error);
      if (!serialized) throw error;
      result = serialized;
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });
  if (ListResourcesRequestSchema && ReadResourceRequestSchema) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listMcpResources() }));
    server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const result = readMcpResource(request.params.uri, runtime.database);
      return { contents: [{ uri: request.params.uri, mimeType: "application/json", text: JSON.stringify(result, null, 2) }] };
    });
  }
  await server.connect(new StdioServerTransport());
}
