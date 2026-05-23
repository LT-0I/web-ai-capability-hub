import { z } from "zod";

const yaml = require("js-yaml") as { load(input: string): unknown };

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "expected semver");
const ManifestIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "expected lowercase dot/kebab manifest id");
const ModuleSymbolRefSchema = z
  .string()
  .regex(/^.+\.ts#[A-Za-z_$][A-Za-z0-9_$]*$/, "expected TS module path plus #Symbol");

export enum ManifestKind {
  Recipe = "recipe",
  Direct = "direct"
}

export const ManifestTargetKindSchema = z.enum(["webai", "researchdb", "patentdb", "generic"]);
export const ManifestMaturitySchema = z.enum(["draft", "experimental", "stable", "deprecated"]);
export const ManifestSafetyClassSchema = z.enum([
  "read",
  "write",
  "upload",
  "export",
  "publish",
  "account",
  "payment",
  "batch"
]);

export const SelectorCandidateSchema = z
  .object({
    role: z.string().optional(),
    nameIncludes: z.string().optional(),
    css: z.string().optional(),
    xpath: z.string().optional()
  })
  .strict();

export const SelectorRoleSchema = z
  .object({
    ref: z.string().optional(),
    primary: z.string().optional(),
    candidates: z.array(SelectorCandidateSchema).optional(),
    template: z.string().optional(),
    templates: z.record(z.record(z.unknown())).optional(),
    heal_policy: z.enum(["off", "report", "auto"]).optional(),
    fingerprintRef: z.string().optional()
  })
  .strict();

export const CapabilityManifestSchema = z
  .object({
    id: ManifestIdSchema,
    version: SemverSchema,
    target: z
      .object({
        kind: ManifestTargetKindSchema,
        provider: z.string().min(1),
        baseUrl: z.string().url().optional()
      })
      .strict(),
    operation: z.string().min(1),
    kind: z.nativeEnum(ManifestKind),
    maturity: ManifestMaturitySchema,
    safety: z
      .object({
        class: ManifestSafetyClassSchema,
        requiresApproval: z.boolean(),
        approvalReason: z.string().optional()
      })
      .strict(),
    descriptionLiteral: z.string(),
    inputSchemaRef: ModuleSymbolRefSchema,
    outputSchemaRef: ModuleSymbolRefSchema,
    preconditions: z.array(z.record(z.unknown())).optional(),
    selectors: z.record(SelectorRoleSchema).optional(),
    recipe: z
      .object({
        handler: ModuleSymbolRefSchema,
        evidence: z.object({ required: z.array(z.string()) }).strict().optional(),
        errors: z.record(z.string()).optional()
      })
      .strict()
      .optional(),
    direct: z
      .object({
        handler: ModuleSymbolRefSchema,
        module: z.string().optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.kind === ManifestKind.Recipe && !manifest.recipe) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recipe"], message: "recipe is required when kind=recipe" });
    }
    if (manifest.kind === ManifestKind.Direct && !manifest.direct) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["direct"], message: "direct is required when kind=direct" });
    }
  });

export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

export interface ParseManifestResult {
  ok: boolean;
  manifest: CapabilityManifest | null;
  errors: string[];
}

function formatIssue(issue: z.ZodIssue): string {
  const location = issue.path.length ? issue.path.join(".") : "<root>";
  return `${location}: ${issue.message}`;
}

export function parseManifest(yamlText: string): ParseManifestResult {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText);
  } catch (error) {
    return { ok: false, manifest: null, errors: [error instanceof Error ? error.message : String(error)] };
  }

  const result = CapabilityManifestSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, manifest: null, errors: result.error.issues.map(formatIssue) };
  }

  return { ok: true, manifest: result.data, errors: [] };
}
