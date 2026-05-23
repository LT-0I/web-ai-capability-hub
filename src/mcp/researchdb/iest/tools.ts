import { objectSchema, scalar } from "../../../utils/schema";
import { researchIestSearch, researchIestFilter, researchIestExport, IestSearchArgs, IestFilterArgs, IestExportArgs } from "../../../handlers/researchdb/legacy/iest";

export const researchIestSearchInput = objectSchema<IestSearchArgs>({
  query: scalar.string("Journal of the IEST search query; canonical URL uses q[0]=<query>, not q1="),
  field: { ...scalar.enum(["all", "alternative-title", "publisher", "affiliation", "subject", "abstract", "fulltext", "title", "identifier", "author"], "Refine terms field"), default: "all" },
  page_size: scalar.number("Optional page size hint; PubFactory renders 10 results/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iest" },
  cdp_port: { ...scalar.number("CDP port override; IEST recipe requires 9245"), default: 9245 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIestFilterInput = objectSchema<IestFilterArgs>({
  query: scalar.string("Journal of the IEST search query; canonical URL uses q[0]=<query>"),
  field: { ...scalar.enum(["all", "alternative-title", "publisher", "affiliation", "subject", "abstract", "fulltext", "title", "identifier", "author"], "Initial/refine search field"), default: "all" },
  access: scalar.string("Optional Refine by Access option: All Content, Open Access, or Free"),
  type: scalar.string("Optional Refine by Type option, e.g. Article"),
  from_year: scalar.number("Refine by Date start year"),
  to_year: scalar.number("Refine by Date end year"),
  refine_query: scalar.string("Optional Refine terms query"),
  refine_field: { ...scalar.enum(["all", "alternative-title", "publisher", "affiliation", "subject", "abstract", "fulltext", "title", "identifier", "author"], "Refine terms field"), default: "all" },
  page_size: scalar.number("Optional page size hint; PubFactory renders 10 results/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iest" },
  cdp_port: { ...scalar.number("CDP port override; IEST recipe requires 9245"), default: 9245 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIestExportInput = objectSchema<IestExportArgs>({
  article_url: scalar.string("Journal of the IEST article URL on jiest.kglmeridian.com"),
  article_path: scalar.string("Journal of the IEST article path, e.g. /view/journals/jiet/49/1/article-p21.xml"),
  format: { ...scalar.enum(["ris", "bib", "enw"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iest" },
  cdp_port: { ...scalar.number("CDP port override; IEST recipe requires 9245"), default: 9245 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export { researchIestSearch, researchIestFilter, researchIestExport };

export const iestResearchTools = [
  { name: "research_iest_search", description: "Search Journal of the IEST on the verified KGL Meridian/PubFactory q[0] results surface with bounded hydration polling.", schema: researchIestSearchInput, handler: async (args: IestSearchArgs) => researchIestSearch(args) },
  { name: "research_iest_filter", description: "Search and refine Journal of the IEST through the verified Chakra Filter & Refine drawer facets with URL/count confirmation.", schema: researchIestFilterInput, handler: async (args: IestFilterArgs) => researchIestFilter(args) },
  { name: "research_iest_export", description: "Export a real per-article Journal of the IEST citation artifact through Tools → Cite → CDP artifact-click; no synthesized fallback.", schema: researchIestExportInput, handler: async (args: IestExportArgs) => researchIestExport(args) }
];
