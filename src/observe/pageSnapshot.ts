export { readPageSnapshot, readHtmlSnapshot, readHtmlSnapshotFromFile, PageReadOptions } from "../reader/snapshot";
export { enrichSelectorCandidates, selectorCandidatesForElement } from "./selectorCandidates";
export { redactSnapshot } from "./redaction";

export class PageSnapshotReader {
  async read(page: any, options: import("../reader/snapshot").PageReadOptions = {}) {
    const { readPageSnapshot } = await import("../reader/snapshot");
    return readPageSnapshot(page, options);
  }
}
