const fs = require("node:fs");
const path = require("node:path");
import { readConfigFile } from "../utils/yaml";
import { SiteAdapter, validateAdapter } from "./adapterSchema";

export function loadAdapter(filePath: string): SiteAdapter {
  return validateAdapter(readConfigFile(filePath));
}

export function listAdapters(adapterDir = path.resolve(process.cwd(), "configs/adapters")): SiteAdapter[] {
  if (!fs.existsSync(adapterDir)) return [];
  return fs.readdirSync(adapterDir)
    .filter((name: string) => /\.(ya?ml|json)$/i.test(name))
    .map((name: string) => loadAdapter(path.join(adapterDir, name)));
}

export function adapterForUrl(url: string, adapters = listAdapters()): SiteAdapter | undefined {
  const parsed = new URL(url);
  return adapters.find((adapter) => adapter.hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)));
}
