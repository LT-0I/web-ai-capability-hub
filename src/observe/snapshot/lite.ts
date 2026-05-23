const crypto = require("node:crypto");

export interface LiteRoleNode {
  role: string;
  name?: string;
  children?: LiteRoleNode[];
}

export interface LiteSnapshot {
  url: string;
  title: string;
  role_tree: LiteRoleNode | null;
  state_hash: string;
}

const MAX_SERIALIZED_BYTES = 4096;
const MAX_NODE_NAME = 120;
const MAX_CHILDREN = 24;

function trimName(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return undefined;
  return text.length > MAX_NODE_NAME ? `${text.slice(0, MAX_NODE_NAME - 1)}…` : text;
}

function reduceAxNode(node: any, depth = 0): LiteRoleNode | null {
  if (!node || depth > 6) return null;
  const children = Array.isArray(node.children) ? node.children.map((child: any) => reduceAxNode(child, depth + 1)).filter(Boolean).slice(0, MAX_CHILDREN) as LiteRoleNode[] : [];
  const role = String(node.role || "unknown");
  const name = trimName(node.name);
  if (role === "text" && !name && !children.length) return null;
  return { role, ...(name ? { name } : {}), ...(children.length ? { children } : {}) };
}

function hashSnapshot(url: string, title: string, roleTree: LiteRoleNode | null): string {
  return crypto.createHash("sha256").update(JSON.stringify({ url, title, roleTree })).digest("hex").slice(0, 16);
}

function serializedBytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
function trimTreeToBudget(snapshot: LiteSnapshot): LiteSnapshot {
  while (snapshot.role_tree && serializedBytes(snapshot) > MAX_SERIALIZED_BYTES) {
    const queue: LiteRoleNode[] = [snapshot.role_tree];
    let deepest: LiteRoleNode | undefined;
    while (queue.length) {
      const node = queue.shift()!;
      if (node.children?.length) { deepest = node; queue.push(...node.children); }
    }
    if (!deepest?.children?.length) break;
    deepest.children.pop();
  }
  return snapshot;
}

export async function captureLiteSnapshot(page: any): Promise<LiteSnapshot> {
  const url = page?.url?.() || "";
  const title = await page?.title?.().catch(() => "") || "";
  const ax = await page?.accessibility?.snapshot?.({ interestingOnly: true }).catch(() => null);
  const role_tree = reduceAxNode(ax);
  return trimTreeToBudget({ url, title, role_tree, state_hash: hashSnapshot(url, title, role_tree) });
}

export function liteSnapshotFromRoleTree(url: string, title: string, role_tree: LiteRoleNode | null): LiteSnapshot {
  return trimTreeToBudget({ url, title, role_tree, state_hash: hashSnapshot(url, title, role_tree) });
}
