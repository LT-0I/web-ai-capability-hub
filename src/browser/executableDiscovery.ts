const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

export type BrowserKind = "chrome" | "edge" | "chromium";

export interface BrowserExecutableCandidate {
  kind: BrowserKind;
  path: string;
  source: "env" | "standard-path" | "path";
}

function exists(filePath?: string): boolean {
  return !!filePath && fs.existsSync(filePath);
}

function which(command: string): string | undefined {
  try {
    const cmd = process.platform === "win32" ? "where" : "command";
    const args = process.platform === "win32" ? [command] : ["-v", command];
    const result = childProcess.execFileSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    return result.split(/\r?\n/).map((line: string) => line.trim()).find(Boolean);
  } catch {
    return undefined;
  }
}

export function browserExecutableCandidates(): BrowserExecutableCandidate[] {
  const candidates: BrowserExecutableCandidate[] = [];
  if (process.env.WAH_BROWSER_EXECUTABLE) candidates.push({ kind: "chrome", path: process.env.WAH_BROWSER_EXECUTABLE, source: "env" });
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean) as string[];
    for (const root of roots) {
      candidates.push({ kind: "chrome", path: path.join(root, "Google", "Chrome", "Application", "chrome.exe"), source: "standard-path" });
      candidates.push({ kind: "edge", path: path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"), source: "standard-path" });
    }
  } else if (process.platform === "darwin") {
    candidates.push({ kind: "chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", source: "standard-path" });
    candidates.push({ kind: "edge", path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", source: "standard-path" });
    candidates.push({ kind: "chrome", path: path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), source: "standard-path" });
    candidates.push({ kind: "edge", path: path.join(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"), source: "standard-path" });
  } else {
    for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable"]) {
      const found = which(command);
      if (found) candidates.push({ kind: command.includes("edge") ? "edge" : command.includes("chromium") ? "chromium" : "chrome", path: found, source: "path" });
    }
    for (const p of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/snap/bin/chromium", "/usr/bin/microsoft-edge"]) {
      candidates.push({ kind: p.includes("edge") ? "edge" : p.includes("chromium") ? "chromium" : "chrome", path: p, source: "standard-path" });
    }
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findBrowserExecutable(preferred?: BrowserKind): BrowserExecutableCandidate | undefined {
  const candidates = browserExecutableCandidates().filter((candidate) => exists(candidate.path));
  return candidates.find((candidate) => candidate.kind === preferred) || candidates[0];
}
