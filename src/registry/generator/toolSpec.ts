import { CapabilityManifest, parseManifest } from "../manifest/schema";

export interface ManifestSource {
  path: string;
  raw: string;
}

export interface GeneratedToolSpec {
  fileRelPath: string;
  contents: string;
}

function isManifestSource(value: CapabilityManifest | ManifestSource): value is ManifestSource {
  return typeof (value as ManifestSource).raw === "string";
}

function slugify(value: string): string { return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); }
function camel(value: string): string {
  return slugify(value).split("-").map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function manifestFromInput(input: CapabilityManifest | ManifestSource): CapabilityManifest | undefined {
  if (!isManifestSource(input)) return input;
  const parsed = parseManifest(input.raw);
  return parsed.manifest || undefined;
}

function mcpNameFor(manifest: CapabilityManifest): string {
  const target = manifest.target.provider.replace(/-/g, "_");
  if (manifest.target.kind === "researchdb") return `research_${target}_${manifest.operation}`;
  if (manifest.target.kind === "webai") return `webai_${target}_${manifest.operation.replace(/-/g, "_")}`;
  if (manifest.target.kind === "generic" && manifest.id.startsWith("wah.")) return `wah_${manifest.operation.replace(/-/g, "_")}`;
  return manifest.id.replace(/[.-]/g, "_");
}

export function generateToolSpecs(inputs: Array<CapabilityManifest | ManifestSource>): GeneratedToolSpec[] {
  return inputs
    .map(manifestFromInput)
    .filter((manifest): manifest is CapabilityManifest => !!manifest)
    .map((manifest) => {
      const base = slugify(manifest.id);
      const exportName = `${camel(manifest.id)}ToolSpec`;
      const toolName = mcpNameFor(manifest);
      const description = JSON.stringify(manifest.descriptionLiteral);
      const manifestId = JSON.stringify(manifest.id);
      return {
        fileRelPath: `src/generated/tools/${base}.ts`,
        contents: `import { objectSchema } from "../../utils/schema";\nimport { ToolSpec } from "../../mcp/tools";\nimport { ExecutionEngine } from "../../runtime/exec/engine";\n\nexport const ${exportName}: ToolSpec = {\n  name: ${JSON.stringify(toolName)},\n  description: ${description},\n  schema: objectSchema<Record<string, unknown>>({}, []),\n  handler: async (args, runtime) => ExecutionEngine.run(${manifestId}, args, runtime as any)\n};\n\nexport default ${exportName};\n`
      };
    });
}
