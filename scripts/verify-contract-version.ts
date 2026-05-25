import fs from "node:fs";
import path from "node:path";

export interface ContractVersionMismatch {
  source: string;
  expected: string | number | boolean;
  actual: string | number | boolean | null;
}

export interface ContractVersionVerificationResult {
  ok: boolean;
  mismatches: ContractVersionMismatch[];
}

type ConsumerContract = {
  package_version?: unknown;
  contract_version?: unknown;
  commands?: Array<{ mcp_name?: unknown }>;
  error_codes?: unknown[];
};

const EXPECTED_PACKAGE_VERSION = "2.1.0";
const EXPECTED_CONTRACT_VERSION = "consumer-contract-2.1.0";
const EXPECTED_COMMANDS = 212;
const EXPECTED_ERROR_CODES = 40;
const EXPECTED_WEBAI_ROWS = 61;
const EXPECTED_RESEARCH_ROWS = 121;

function readJson<T>(repoRoot: string, relPath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relPath), "utf8")) as T;
}

function readText(repoRoot: string, relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function addMismatch(
  mismatches: ContractVersionMismatch[],
  source: string,
  expected: string | number | boolean,
  actual: string | number | boolean | null
): void {
  if (actual !== expected) mismatches.push({ source, expected, actual });
}

function matchText(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern);
  return match?.[1] ?? null;
}

function countRows(contract: ConsumerContract, prefix: string): number {
  return (contract.commands ?? []).filter((command) =>
    typeof command.mcp_name === "string" && command.mcp_name.startsWith(prefix)
  ).length;
}

export function verifyContractVersion(repoRoot = process.cwd()): ContractVersionVerificationResult {
  const mismatches: ContractVersionMismatch[] = [];
  const pkg = readJson<{ version?: unknown }>(repoRoot, "package.json");
  const contract = readJson<ConsumerContract>(repoRoot, "configs/consumer-contract.json");
  const readmeZh = readText(repoRoot, "README.md");
  const readmeEn = readText(repoRoot, "README.en.md");
  const consumerDoc = readText(repoRoot, "docs/CONSUMER_CONTRACT.md");

  addMismatch(mismatches, "package.json version", EXPECTED_PACKAGE_VERSION, typeof pkg.version === "string" ? pkg.version : null);
  addMismatch(
    mismatches,
    "configs/consumer-contract.json package_version",
    EXPECTED_PACKAGE_VERSION,
    typeof contract.package_version === "string" ? contract.package_version : null
  );
  addMismatch(
    mismatches,
    "configs/consumer-contract.json contract_version",
    EXPECTED_CONTRACT_VERSION,
    typeof contract.contract_version === "string" ? contract.contract_version : null
  );

  addMismatch(
    mismatches,
    "README.md badge version",
    EXPECTED_PACKAGE_VERSION,
    matchText(readmeZh, /badge\/version-([0-9]+\.[0-9]+\.[0-9]+)-blue/)
  );
  addMismatch(
    mismatches,
    "README.md package version line",
    EXPECTED_PACKAGE_VERSION,
    matchText(readmeZh, /包版本\s*`([^`]+)`/)
  );
  addMismatch(
    mismatches,
    "README.md contract badge",
    EXPECTED_CONTRACT_VERSION,
    matchText(readmeZh, /badge\/consumer--contract-([0-9]+\.[0-9]+\.[0-9]+)-blueviolet/)?.replace(/^/, "consumer-contract-") ?? null
  );
  addMismatch(
    mismatches,
    "README.en.md badge version",
    EXPECTED_PACKAGE_VERSION,
    matchText(readmeEn, /badge\/version-([0-9]+\.[0-9]+\.[0-9]+)-blue/)
  );
  addMismatch(
    mismatches,
    "README.en.md package version line",
    EXPECTED_PACKAGE_VERSION,
    matchText(readmeEn, /package\s+`([^`]+)`/i)
  );
  addMismatch(
    mismatches,
    "README.en.md contract badge",
    EXPECTED_CONTRACT_VERSION,
    matchText(readmeEn, /badge\/consumer--contract-([0-9]+\.[0-9]+\.[0-9]+)-blueviolet/)?.replace(/^/, "consumer-contract-") ?? null
  );
  addMismatch(
    mismatches,
    "docs/CONSUMER_CONTRACT.md contract header",
    EXPECTED_CONTRACT_VERSION,
    matchText(consumerDoc, /^Contract:\s*`([^`]+)`/m)
  );

  addMismatch(mismatches, "configs/consumer-contract.json commands.length", EXPECTED_COMMANDS, contract.commands?.length ?? null);
  addMismatch(mismatches, "configs/consumer-contract.json error_codes.length", EXPECTED_ERROR_CODES, contract.error_codes?.length ?? null);
  addMismatch(mismatches, "configs/consumer-contract.json webai_ rows", EXPECTED_WEBAI_ROWS, countRows(contract, "webai_"));
  addMismatch(mismatches, "configs/consumer-contract.json research_ rows", EXPECTED_RESEARCH_ROWS, countRows(contract, "research_"));

  return { ok: mismatches.length === 0, mismatches };
}

if (require.main === module) {
  const result = verifyContractVersion();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
