import { objectSchema, scalar } from "../../../utils/schema";
import { researchAcmSearch, researchAcmFilter, researchAcmExport, AcmSearchArgs, AcmFilterArgs, AcmExportArgs } from "./flow";

export const researchAcmSearchInput = objectSchema<AcmSearchArgs>({
  query: scalar.string("ACM Digital Library query text"),
  area: { ...scalar.enum(["AllField", "Title", "PublicationTitle", "Contrib", "Abstract", "Fulltext", "Affiliation", "Keyword", "ConferenceLocation", "Sponsor", "ISBN", "DOI"], "ACM search area"), default: "AllField" },
  page_size: scalar.number("Optional ACM pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-acm" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAcmFilterInput = objectSchema<AcmFilterArgs>({
  query: scalar.string("ACM Digital Library query text"),
  area: { ...scalar.enum(["AllField", "Title", "PublicationTitle", "Contrib", "Abstract", "Fulltext", "Affiliation", "Keyword", "ConferenceLocation", "Sponsor", "ISBN", "DOI"], "ACM search area"), default: "AllField" },
  after_year: scalar.number("AfterYear server-side date refine"),
  before_year: scalar.number("BeforeYear server-side date refine"),
  sort_by: scalar.string("Non-gated sort refine: downloaded, cited, or relevance"),
  facet: scalar.string("Premium-gated post-results facet; returns PLAN_OR_QUOTA_REQUIRED"),
  content_type: scalar.string("Premium-gated Content Type facet; returns PLAN_OR_QUOTA_REQUIRED"),
  author: scalar.string("Premium-gated Authors facet; returns PLAN_OR_QUOTA_REQUIRED"),
  publisher: scalar.string("Premium-gated Publisher facet; returns PLAN_OR_QUOTA_REQUIRED"),
  page_size: scalar.number("Optional ACM pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-acm" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAcmExportInput = objectSchema<AcmExportArgs>({
  doi: scalar.string("ACM DOI to export"),
  format: { ...scalar.enum(["bibtex", "endnote", "acm"], "Citation export format"), default: "bibtex" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-acm" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const acmResearchTools = [
  {
    name: "research_acm_search",
    description: "Search ACM Digital Library via the verified ACM headless recipe.",
    schema: researchAcmSearchInput,
    handler: async (args: AcmSearchArgs) => researchAcmSearch(args)
  },
  {
    name: "research_acm_filter",
    description: "Search and refine ACM Digital Library with verified non-gated date/sort query parameters; Premium facets return PLAN_OR_QUOTA_REQUIRED.",
    schema: researchAcmFilterInput,
    handler: async (args: AcmFilterArgs) => researchAcmFilter(args)
  },
  {
    name: "research_acm_export",
    description: "Export a real ACM per-result citation artifact using the verified CDP artifact-click path.",
    schema: researchAcmExportInput,
    handler: async (args: AcmExportArgs) => researchAcmExport(args)
  }
];

export { researchAcmSearch, researchAcmFilter, researchAcmExport };
