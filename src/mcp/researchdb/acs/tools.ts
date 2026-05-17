import { objectSchema, scalar } from "../../../utils/schema";
import { researchAcsSearch, researchAcsFilter, researchAcsExport, AcsSearchArgs, AcsFilterArgs, AcsExportArgs } from "./flow";

const acsFields = ["AllField", "Title", "Contrib", "Abstract", "Figure/Table Caption"];

export const researchAcsSearchInput = objectSchema<AcsSearchArgs>({
  query: scalar.string("ACS Publications query text"),
  area: { ...scalar.enum(acsFields, "ACS search area"), default: "AllField" },
  title_query: scalar.string("Optional second-row Title query; ACS combines rows with implicit AND"),
  page_size: scalar.number("Optional ACS pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-acs" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9232 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAcsFilterInput = objectSchema<AcsFilterArgs>({
  query: scalar.string("ACS Publications query text"),
  area: { ...scalar.enum(acsFields, "ACS search area"), default: "AllField" },
  title_query: scalar.string("Optional second-row Title query; ACS combines rows with implicit AND"),
  earliest: scalar.string("Publication Date facet Earliest range, e.g. [20250516 TO 202605162359]"),
  pub_type: scalar.string("PubType facet, e.g. journals"),
  article_type: scalar.string("ArticleType facet"),
  article_subject: scalar.string("ArticleSubject facet"),
  concept_id: scalar.string("ConceptID topic facet"),
  contrib_raw: scalar.string("ContribRaw contributor facet"),
  series_key: scalar.string("SeriesKey publication facet"),
  publisher: scalar.string("Publisher facet"),
  page_size: scalar.number("Optional ACS pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-acs" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9232 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAcsExportInput = objectSchema<AcsExportArgs>({
  doi: scalar.string("ACS DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-acs" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9232 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const acsResearchTools = [
  { name: "research_acs_search", description: "Search ACS Publications via the verified ACS headless recipe.", schema: researchAcsSearchInput, handler: async (args: AcsSearchArgs) => researchAcsSearch(args) },
  { name: "research_acs_filter", description: "Search and refine ACS Publications using verified doSearch facet parameters.", schema: researchAcsFilterInput, handler: async (args: AcsFilterArgs) => researchAcsFilter(args) },
  { name: "research_acs_export", description: "Export a real ACS per-result RIS or BibTeX citation artifact using the verified CDP artifact-click path.", schema: researchAcsExportInput, handler: async (args: AcsExportArgs) => researchAcsExport(args) }
];

export { researchAcsSearch, researchAcsFilter, researchAcsExport };
