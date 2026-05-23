import { RuntimeLeaseStore, runtimeLeaseStore } from "../pool/leaseStore";
import { scoreHealCandidate, HealComponentScores, jaccard } from "./scoring";

export type HealPolicy = "off" | "report" | "auto";

export interface HealRequest {
  runId: string;
  manifestId: string;
  selectorRole: string;
  primarySelector?: string;
  ariaRole?: string;
  ariaName?: string;
  nearText?: string;
  domFingerprint?: string;
  healPolicy?: HealPolicy;
}

export interface HealResolution {
  ok: boolean;
  degraded: boolean;
  selector?: string;
  errorCode?: "UI_DRIFT_DETECTED" | "HEAL_CONFIDENCE_LOW";
  confidence: number;
  componentScores: HealComponentScores;
  resolutionStep: number;
  healPolicy: HealPolicy;
}

export class HealService {
  constructor(private store: RuntimeLeaseStore = runtimeLeaseStore()) {}

  async resolve(page: any, request: HealRequest): Promise<HealResolution> {
    const healPolicy: HealPolicy = request.healPolicy || "report";
    if (request.primarySelector) {
      const count = await page.locator?.(request.primarySelector).count?.().catch(() => 0);
      if (count) return this.result(request, healPolicy, request.primarySelector, 1, { ariaMatch: 1, nearTextJaccard: 1, bboxOverlap: 1, domStructureSimilarity: 1, roleExactMatch: 1 }, false);
    }
    if (healPolicy === "off") {
      return {
        ok: false,
        degraded: true,
        selector: request.primarySelector,
        errorCode: "UI_DRIFT_DETECTED",
        confidence: 0,
        componentScores: { ariaMatch: 0, nearTextJaccard: 0, bboxOverlap: 0, domStructureSimilarity: 0, roleExactMatch: 0 },
        resolutionStep: 0,
        healPolicy
      };
    }
    const ariaSelector = request.ariaRole && request.ariaName ? `${request.ariaRole}[name="${request.ariaName.replace(/"/g, "\\\"")}"]` : undefined;
    if (ariaSelector) {
      const byRole = page.getByRole?.(request.ariaRole as any, { name: request.ariaName });
      const count = await byRole?.count?.().catch(() => 0);
      if (count) return this.result(request, healPolicy, ariaSelector, 2, { ariaMatch: 1, roleExactMatch: 1, nearTextJaccard: 0.8 }, true);
    }
    const textScore = request.nearText ? jaccard(request.nearText, request.ariaName || request.selectorRole) : 0;
    const scored = scoreHealCandidate({ ariaMatch: 0, nearTextJaccard: textScore, bboxOverlap: 0, domStructureSimilarity: request.domFingerprint ? 0.5 : 0, roleExactMatch: 0 });
    this.store.insertDriftEvent({ run_id: request.runId, manifest_id: request.manifestId, selector_role: request.selectorRole, resolution_step: 4, confidence: scored.confidence, component_scores_json: JSON.stringify(scored.componentScores) });
    return { ok: false, degraded: true, selector: request.primarySelector, errorCode: scored.confidence < 0.5 ? "HEAL_CONFIDENCE_LOW" : "UI_DRIFT_DETECTED", confidence: scored.confidence, componentScores: scored.componentScores, resolutionStep: 4, healPolicy };
  }

  private result(request: HealRequest, healPolicy: HealPolicy, selector: string, resolutionStep: number, scores: Partial<HealComponentScores>, degraded: boolean): HealResolution {
    const scored = scoreHealCandidate(scores);
    if (degraded) this.store.insertDriftEvent({ run_id: request.runId, manifest_id: request.manifestId, selector_role: request.selectorRole, resolution_step: resolutionStep, confidence: scored.confidence, component_scores_json: JSON.stringify(scored.componentScores) });
    return { ok: !degraded || healPolicy === "auto", degraded, selector: healPolicy === "auto" || !degraded ? selector : request.primarySelector, errorCode: degraded ? "UI_DRIFT_DETECTED" : undefined, confidence: scored.confidence, componentScores: scored.componentScores, resolutionStep, healPolicy };
  }
}

export const healService = new HealService();
