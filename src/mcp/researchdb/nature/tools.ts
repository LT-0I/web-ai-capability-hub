import { objectSchema, scalar } from "../../../utils/schema";
import { researchNatureSearch, researchNatureFilter, researchNatureExport, NatureSearchArgs, NatureFilterArgs, NatureExportArgs } from "./flow";

const natureArticleTypes = ["research", "reviews"];
const natureFacetParams = ["article_type", "journal", "subject", "date_range"];
const natureFormats = ["ris"];

export const researchNatureSearchInput = objectSchema<NatureSearchArgs>({
  query: scalar.string("Nature #advanced-search-keywords boolean query text"),
  start_year: scalar.number("Nature #start_year value"),
  end_year: scalar.number("Nature #end_year value"),
  order: { ...scalar.string("Nature search order"), default: "relevance" },
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-nature" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9248 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchNatureFilterInput = objectSchema<NatureFilterArgs>({
  query: scalar.string("Nature #advanced-search-keywords boolean query text"),
  start_year: scalar.number("Nature #start_year value"),
  end_year: scalar.number("Nature #end_year value"),
  order: { ...scalar.string("Nature search order"), default: "relevance" },
  article_type: scalar.enum(natureArticleTypes, "Nature article_type facet value, e.g. reviews"),
  journal: scalar.string("Nature journal facet value, e.g. srep"),
  subject: scalar.string("Nature subject facet value, e.g. ecology"),
  date_range: scalar.string("Nature date_range facet value such as last_year or 2021-2024"),
  facet_param: scalar.enum(natureFacetParams, "Exact Nature URL facet param"),
  facet_value: scalar.string("Exact Nature URL facet value"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-nature" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9248 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchNatureExportInput = objectSchema<NatureExportArgs>({
  doi: scalar.string("Nature DOI to export, e.g. 10.1038/s41598-024-65383-9"),
  format: { ...scalar.enum(natureFormats, "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-nature" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9248 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const natureResearchTools = [
  {
    name: "research_nature_search",
    description: "Search Nature journals using the verified NUAA advanced-search recipe (#searchForm / q / date_range).",
    schema: researchNatureSearchInput,
    handler: async (args: NatureSearchArgs) => researchNatureSearch(args)
  },
  {
    name: "research_nature_filter",
    description: "Search and refine Nature results through the verified server-side GET facet parameters such as article_type=reviews.",
    schema: researchNatureFilterInput,
    handler: async (args: NatureFilterArgs) => researchNatureFilter(args)
  },
  {
    name: "research_nature_export",
    description: "Export a real per-article Nature RIS citation through the verified CDP browser:artifact-click path without synthesized fallback.",
    schema: researchNatureExportInput,
    handler: async (args: NatureExportArgs) => researchNatureExport(args)
  }
];

export { researchNatureSearch, researchNatureFilter, researchNatureExport };
