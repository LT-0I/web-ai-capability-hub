import { objectSchema, scalar } from "../../../utils/schema";
import { researchAipSearch, researchAipFilter, researchAipExport, AipSearchArgs, AipFilterArgs, AipExportArgs } from "./flow";

export const researchAipSearchInput = objectSchema<AipSearchArgs>({
  query: scalar.string("AIP Publishing Scitation query text"),
  page_size: scalar.number("Optional AIP pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-aip" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9249 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAipFilterInput = objectSchema<AipFilterArgs>({
  query: scalar.string("AIP Publishing Scitation query text"),
  content_type: scalar.string("Format/content type facet, e.g. Journal Articles"),
  journal: scalar.string("Journal facet, e.g. Physics of Fluids"),
  subject: scalar.string("Subject facet value"),
  article_type: scalar.string("Article type facet, e.g. Research Article"),
  book_series: scalar.string("Book series facet, e.g. AIPP Books"),
  issue_section: scalar.string("Issue section facet, e.g. ARTICLES"),
  collection: scalar.string("Special collection facet value"),
  from_date: scalar.string("Date range start, YYYY/MM/DD"),
  to_date: scalar.string("Date range end, YYYY/MM/DD"),
  page_size: scalar.number("Optional AIP pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-aip" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9249 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAipExportInput = objectSchema<AipExportArgs>({
  doi: scalar.string("AIP DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex", "endnote", "refworks"], "Citation export format"), default: "bibtex" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-aip" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9249 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const aipResearchTools = [
  {
    name: "research_aip_search",
    description: "Search AIP Publishing Scitation via the verified Silverchair search-results URL contract.",
    schema: researchAipSearchInput,
    handler: async (args: AipSearchArgs) => researchAipSearch(args)
  },
  {
    name: "research_aip_filter",
    description: "Apply AIP Silverchair URL refinements using f_* facet params such as f_JournalDisplayName=Physics of Fluids; no fallback or synthesis is used.",
    schema: researchAipFilterInput,
    handler: async (args: AipFilterArgs) => researchAipFilter(args)
  },
  {
    name: "research_aip_export",
    description: "Export a real AIP per-record citation artifact through /Citation/Download using the managed CDP page fetch with X-Requested-With.",
    schema: researchAipExportInput,
    handler: async (args: AipExportArgs) => researchAipExport(args)
  }
];

export { researchAipSearch, researchAipFilter, researchAipExport };
