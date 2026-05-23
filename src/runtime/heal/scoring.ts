export interface HealComponentScores {
  ariaMatch: number;
  nearTextJaccard: number;
  bboxOverlap: number;
  domStructureSimilarity: number;
  roleExactMatch: number;
}

function clamp(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }

export function scoreHealCandidate(scores: Partial<HealComponentScores>): { confidence: number; componentScores: HealComponentScores } {
  const componentScores: HealComponentScores = {
    ariaMatch: clamp(scores.ariaMatch ?? 0),
    nearTextJaccard: clamp(scores.nearTextJaccard ?? 0),
    bboxOverlap: clamp(scores.bboxOverlap ?? 0),
    domStructureSimilarity: clamp(scores.domStructureSimilarity ?? 0),
    roleExactMatch: clamp(scores.roleExactMatch ?? 0)
  };
  const confidence =
    0.35 * componentScores.ariaMatch +
    0.25 * componentScores.nearTextJaccard +
    0.20 * componentScores.bboxOverlap +
    0.15 * componentScores.domStructureSimilarity +
    0.05 * componentScores.roleExactMatch;
  return { confidence, componentScores };
}

export function jaccard(a: string, b: string): number {
  const as = new Set(String(a || "").toLowerCase().split(/\W+/).filter(Boolean));
  const bs = new Set(String(b || "").toLowerCase().split(/\W+/).filter(Boolean));
  if (!as.size && !bs.size) return 1;
  const intersection = [...as].filter((item) => bs.has(item)).length;
  const union = new Set([...as, ...bs]).size;
  return union ? intersection / union : 0;
}
