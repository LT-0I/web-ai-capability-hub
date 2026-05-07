import { AccessibilitySummaryNode } from "../shared/types";

function summarize(node: any, depth = 0, limit = 160): AccessibilitySummaryNode | undefined {
  if (!node || depth > 6 || limit <= 0) return undefined;
  const out: AccessibilitySummaryNode = {
    role: String(node.role || "unknown"),
    name: node.name,
    value: node.value,
    checked: node.checked,
    level: node.level
  };
  if (Array.isArray(node.children)) {
    const children: AccessibilitySummaryNode[] = [];
    for (const child of node.children) {
      if (children.length >= limit) break;
      const summarized = summarize(child, depth + 1, Math.max(5, Math.floor(limit / 2)));
      if (summarized) children.push(summarized);
    }
    if (children.length) out.children = children;
  }
  return out;
}

export async function readAccessibilitySummary(page: any): Promise<AccessibilitySummaryNode[]> {
  if (!page?.accessibility?.snapshot && !page?.context?.().browser?.().accessibility) return [];
  try {
    const accessibility = page.accessibility || page.context().browser().accessibility;
    const snapshot = await accessibility.snapshot({ interestingOnly: true });
    const root = summarize(snapshot);
    return root ? [root] : [];
  } catch {
    return [];
  }
}
