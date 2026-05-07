import { PageSnapshot } from "../shared/types";
import { CapabilityDatabase, hashContent } from "./database";
import { CapabilityExtractor } from "./extractor";
import { ServiceTargetRecord, TargetKind } from "./schemas";
import { getWebAiAdapter } from "../adapters/web-ai";

export interface CapabilityUpdateOptions {
  target: string;
  kind?: TargetKind | string;
  profile?: string;
  snapshot: PageSnapshot;
  baseUrl?: string;
}

export class CapabilityUpdater {
  constructor(private database = new CapabilityDatabase(), private extractor = new CapabilityExtractor()) {}

  updateFromSnapshot(options: CapabilityUpdateOptions): { target: string; captureId: string; capabilities: number; uiElements: number; driver: string; contentHash: string } {
    this.database.init();
    const adapter = getWebAiAdapter(options.target);
    const target: ServiceTargetRecord = {
      target_id: options.target,
      kind: options.kind || adapter?.kind || "generic",
      base_url: options.baseUrl || adapter?.baseUrl || options.snapshot.url,
      display_name: adapter?.displayName || options.target,
      metadata: adapter ? { adapter } : undefined
    };
    this.database.upsertServiceTarget(target);
    const contentHash = hashContent({ text: options.snapshot.visibleText, elements: options.snapshot.elements.map((element) => [element.role, element.name, element.selector]) });
    const capture = this.database.insertPageCapture({
      target_id: options.target,
      url: options.snapshot.url,
      title: options.snapshot.title,
      profile: options.profile,
      content_hash: contentHash,
      artifact_refs: [],
      metadata: { warnings: options.snapshot.warnings, language: detectLanguage(options.snapshot.visibleText) }
    });
    if (options.snapshot.screenshotPath) {
      const artifact = this.database.insertArtifact({
        target_id: options.target,
        capture_id: capture.id,
        kind: "screenshot",
        path: options.snapshot.screenshotPath,
        metadata: { url: options.snapshot.url, title: options.snapshot.title }
      });
      this.database.updatePageCaptureArtifactRefs(capture.id, [artifact.id]);
      capture.artifact_refs = [artifact.id];
    }
    const extracted = this.extractor.extract(options.snapshot, { targetId: options.target, kind: options.kind, captureId: capture.id });
    this.database.insertUiElements(extracted.uiElements);
    this.database.upsertCapabilities(extracted.capabilities);
    return { target: options.target, captureId: capture.id, capabilities: extracted.capabilities.length, uiElements: extracted.uiElements.length, driver: this.database.driver(), contentHash };
  }
}

function detectLanguage(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  return "unknown";
}
