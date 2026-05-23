import { objectSchema, scalar } from "../../../utils/schema";
import { researchSiamSearch, researchSiamFilter, researchSiamExport, SiamSearchArgs, SiamFilterArgs, SiamExportArgs } from "../../../handlers/researchdb/legacy/siam";

export const researchSiamSearchInput = objectSchema<SiamSearchArgs>({
  query: scalar.string("SIAM ePubs query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"], "SIAM search area"), default: "AllField" },
  page_size: scalar.number("Optional SIAM pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-siam" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchSiamFilterInput = objectSchema<SiamFilterArgs>({
  query: scalar.string("SIAM ePubs query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"], "SIAM search area"), default: "AllField" },
  after_year: scalar.number("AfterYear filter"),
  before_year: scalar.number("BeforeYear filter"),
  pub_type: scalar.string("PubType facet, e.g. 103 for Article"),
  series_key: scalar.string("SeriesKey journal/book-series facet"),
  contrib_raw: scalar.string("ContribRaw author facet"),
  concept_id: scalar.string("ConceptID topic facet"),
  page_size: scalar.number("Optional SIAM pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-siam" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchSiamExportInput = objectSchema<SiamExportArgs>({
  doi: scalar.string("SIAM DOI to export"),
  format: { ...scalar.enum(["ris", "endnote", "bibtex", "medlars", "refworks"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-siam" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const siamResearchTools = [
  {
    name: "research_siam_search",
    description: "Search SIAM ePubs via the verified SIAM headless recipe.",
    schema: researchSiamSearchInput,
    handler: async (args: SiamSearchArgs) => researchSiamSearch(args)
  },
  {
    name: "research_siam_filter",
    description: "Search and refine SIAM ePubs with verified Atypon date, document type, series, author, and topic URL facet parameters.",
    schema: researchSiamFilterInput,
    handler: async (args: SiamFilterArgs) => researchSiamFilter(args)
  },
  {
    name: "research_siam_export",
    description: "Export a real SIAM citation artifact using the verified in-session same-origin POST path; no artifact-click or download-url fallback.",
    schema: researchSiamExportInput,
    handler: async (args: SiamExportArgs) => researchSiamExport(args)
  }
];

export { researchSiamSearch, researchSiamFilter, researchSiamExport };
