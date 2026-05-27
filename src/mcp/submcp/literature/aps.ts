import { LiteratureDownloadPdfOutput } from "./arxiv";
import {
  PaywalledLiteratureConfig,
  PaywalledLiteratureDownloadPdfArgs,
  registerPaywalledPdfLiteratureDriver,
  runPaywalledLiteratureDownloadPdfTool
} from "./paywalled";

const APS_JOURNAL_SLUG_BY_DOI_PREFIX: Record<string, string> = {
  PhysRevLett: "prl",
  PhysRevA: "pra",
  PhysRevB: "prb",
  PhysRevC: "prc",
  PhysRevD: "prd",
  PhysRevE: "pre",
  PhysRevResearch: "prresearch",
  PhysRevApplied: "prapplied",
  PhysRevFluids: "prfluids",
  PhysRevMaterials: "prmaterials",
  PhysRevX: "prx"
};

function apsArticleUrl(docId: string): string | null {
  const match = /^10\.1103\/([^./]+)\./i.exec(String(docId || "").trim());
  const journalSlug = match ? APS_JOURNAL_SLUG_BY_DOI_PREFIX[match[1]] : null;
  return journalSlug ? `https://journals.aps.org/${journalSlug}/abstract/${docId}` : null;
}

export const apsPaywalledLiteratureConfig: PaywalledLiteratureConfig = {
  db_slug: "aps",
  display_name: "APS Journals",
  default_profile: "research-aps",
  selectors: [
    "a[aria-label*=\"PDF\" i]",
    "a[title*=\"PDF\" i]",
    "a:has-text(\"PDF\")",
    "a.btn-pdf",
    "a[href*=\"/pdf/\" i]",
    "a[href*=\"pdf\" i]"
  ],
  metadata_tool: null,
  unpaywall_fallback: true,
  article_url_resolver: (docId: string) => apsArticleUrl(docId) || (/^10\./.test(docId) ? `https://doi.org/${docId}` : null),
  prefer_article_first: true
};

export async function webAiApsDownloadPdf(args: Partial<PaywalledLiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return runPaywalledLiteratureDownloadPdfTool(apsPaywalledLiteratureConfig, args);
}

registerPaywalledPdfLiteratureDriver(apsPaywalledLiteratureConfig);
