const fs = require("node:fs");
const path = require("node:path");
import { ensureDir, getStoragePaths, safeFilename, timestampForFilename } from "../utils/paths";

export interface StoredArtifact {
  kind: string;
  path: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class ArtifactStore {
  readonly root: string;
  constructor(root = getStoragePaths().dataDir) { this.root = ensureDir(path.join(root, "artifacts")); }

  writeText(kind: string, name: string, text: string, metadata?: Record<string, unknown>): StoredArtifact {
    const createdAt = new Date().toISOString();
    const filePath = path.join(this.root, `${timestampForFilename(new Date(createdAt))}-${safeFilename(name)}.txt`);
    fs.writeFileSync(filePath, text, "utf-8");
    return { kind, path: filePath, createdAt, metadata };
  }

  writeJson(kind: string, name: string, value: unknown, metadata?: Record<string, unknown>): StoredArtifact {
    const createdAt = new Date().toISOString();
    const filePath = path.join(this.root, `${timestampForFilename(new Date(createdAt))}-${safeFilename(name)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
    return { kind, path: filePath, createdAt, metadata };
  }

  recordFile(kind: string, filePath: string, metadata?: Record<string, unknown>): StoredArtifact {
    const createdAt = new Date().toISOString();
    const name = `${timestampForFilename(new Date(createdAt))}-${safeFilename(path.basename(filePath))}.json`;
    const artifactPath = path.join(this.root, name);
    fs.writeFileSync(artifactPath, JSON.stringify({ kind, path: filePath, createdAt, metadata }, null, 2), "utf-8");
    return { kind, path: artifactPath, createdAt, metadata: { ...metadata, filePath } };
  }
}
