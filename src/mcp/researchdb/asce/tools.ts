import { objectSchema, scalar } from "../../../utils/schema";
import { researchAsceSearch, researchAsceFilter, researchAsceExport, AsceSearchArgs, AsceFilterArgs, AsceExportArgs } from "./flow";

export const researchAsceSearchInput = objectSchema<AsceSearchArgs>({
  query: scalar.string("ASCE Library query text"),
  query2: scalar.string("Optional second ASCE query row joined by implicit AND"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "AbstractText", "Affiliation"], "ASCE search area"), default: "AllField" },
  area2: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "AbstractText", "Affiliation"], "ASCE second-row search area"), default: "AllField" },
  page_size: scalar.number("Optional ASCE pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-asce" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAsceFilterInput = objectSchema<AsceFilterArgs>({
  query: scalar.string("ASCE Library query text"),
  query2: scalar.string("Optional second ASCE query row joined by implicit AND"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "AbstractText", "Affiliation"], "ASCE search area"), default: "AllField" },
  area2: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "AbstractText", "Affiliation"], "ASCE second-row search area"), default: "AllField" },
  after_year: scalar.number("AfterYear filter"),
  before_year: scalar.number("BeforeYear filter"),
  content_item_type: scalar.string("ContentItemType facet, e.g. research-article"),
  contrib_raw: scalar.string("ContribRaw author facet"),
  concept_id: scalar.string("ConceptID topic facet"),
  publication: scalar.string("ASCE publication facet"),
  page_size: scalar.number("Optional ASCE pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-asce" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAsceExportInput = objectSchema<AsceExportArgs>({
  doi: scalar.string("ASCE DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex", "endnote", "medlars"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-asce" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const asceResearchTools = [
  {
    name: "research_asce_search",
    description: "Search ASCE Library via the verified ASCE headless recipe.",
    schema: researchAsceSearchInput,
    handler: async (args: AsceSearchArgs) => researchAsceSearch(args)
  },
  {
    name: "research_asce_filter",
    description: "Search and refine ASCE Library with verified Atypon URL facet parameters.",
    schema: researchAsceFilterInput,
    handler: async (args: AsceFilterArgs) => researchAsceFilter(args)
  },
  {
    name: "research_asce_export",
    description: "Export a real ASCE citation artifact using the verified CDP artifact-click path.",
    schema: researchAsceExportInput,
    handler: async (args: AsceExportArgs) => researchAsceExport(args)
  }
];

export { researchAsceSearch, researchAsceFilter, researchAsceExport };
