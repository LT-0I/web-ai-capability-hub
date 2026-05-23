import { objectSchema, scalar } from "../../../utils/schema";
import { researchIetSearch, researchIetFilter, researchIetExport, IetSearchArgs, IetFilterArgs, IetExportArgs } from "../../../handlers/researchdb/legacy/iet";

export const researchIetSearchInput = objectSchema<IetSearchArgs>({
  query: scalar.string("IET Digital Library query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"], "IET search area"), default: "AllField" },
  page_size: scalar.number("Optional IET pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iet" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIetFilterInput = objectSchema<IetFilterArgs>({
  query: scalar.string("IET Digital Library query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"], "IET search area"), default: "AllField" },
  ppub: scalar.string("Ppub date facet/range value"),
  after_year: scalar.number("AfterYear date facet"),
  before_year: scalar.number("BeforeYear date facet"),
  concept_id: scalar.string("ConceptID subject facet"),
  contrib_raw: scalar.string("ContribRaw author facet"),
  series_key: scalar.string("SeriesKey publication facet"),
  alphabet_range: scalar.string("alphabetRange title A-Z facet"),
  page_size: scalar.number("Optional IET pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iet" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIetExportInput = objectSchema<IetExportArgs>({
  doi: scalar.string("IET DOI to export"),
  format: { ...scalar.enum(["ris", "endnote", "bibtex", "medlars", "refworks"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iet" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const ietResearchTools = [
  {
    name: "research_iet_search",
    description: "Search IET Digital Library via the verified IET Atypon/Literatum recipe.",
    schema: researchIetSearchInput,
    handler: async (args: IetSearchArgs) => researchIetSearch(args)
  },
  {
    name: "research_iet_filter",
    description: "Search and refine IET Digital Library with verified link-based GET facet parameters.",
    schema: researchIetFilterInput,
    handler: async (args: IetFilterArgs) => researchIetFilter(args)
  },
  {
    name: "research_iet_export",
    description: "Export a real per-article IET citation artifact using the verified CDP artifact-click POST form path.",
    schema: researchIetExportInput,
    handler: async (args: IetExportArgs) => researchIetExport(args)
  }
];

export { researchIetSearch, researchIetFilter, researchIetExport };
