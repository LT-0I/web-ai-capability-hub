import { objectSchema, scalar } from "../../../utils/schema";
import { researchTandfSearch, researchTandfFilter, researchTandfExport, TandfSearchArgs, TandfFilterArgs, TandfExportArgs } from "../../../handlers/researchdb/legacy/tandf";

export const researchTandfSearchInput = objectSchema<TandfSearchArgs>({
  query: scalar.string("Taylor & Francis Online query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keywords", "Abstract", "Affiliation", "Funder"], "Taylor & Francis search area"), default: "AllField" },
  page_size: scalar.number("Optional Taylor & Francis pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-tandf" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchTandfFilterInput = objectSchema<TandfFilterArgs>({
  query: scalar.string("Taylor & Francis Online query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keywords", "Abstract", "Affiliation", "Funder"], "Taylor & Francis search area"), default: "AllField" },
  after_year: scalar.number("AfterYear filter"),
  before_year: scalar.number("BeforeYear filter"),
  content_item_type: scalar.string("ContentItemType facet, if URL-verified by caller"),
  pub_type: scalar.string("pubType facet, if URL-verified by caller"),
  journal: scalar.string("Journal facet, if URL-verified by caller"),
  access: scalar.string("Access facet: full or open"),
  page_size: scalar.number("Optional Taylor & Francis pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-tandf" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchTandfExportInput = objectSchema<TandfExportArgs>({
  doi: scalar.string("Taylor & Francis DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex"], "File citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-tandf" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const tandfResearchTools = [
  {
    name: "research_tandf_search",
    description: "Search Taylor & Francis Online via the verified T&F headless recipe.",
    schema: researchTandfSearchInput,
    handler: async (args: TandfSearchArgs) => researchTandfSearch(args)
  },
  {
    name: "research_tandf_filter",
    description: "Search and refine Taylor & Francis Online with verified Atypon date URL facet parameters.",
    schema: researchTandfFilterInput,
    handler: async (args: TandfFilterArgs) => researchTandfFilter(args)
  },
  {
    name: "research_tandf_export",
    description: "Export a real Taylor & Francis citation artifact using the verified CDP artifact-click path.",
    schema: researchTandfExportInput,
    handler: async (args: TandfExportArgs) => researchTandfExport(args)
  }
];

export { researchTandfSearch, researchTandfFilter, researchTandfExport };
