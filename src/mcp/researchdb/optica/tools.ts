import { objectSchema, scalar } from "../../../utils/schema";
import { researchOpticaSearch, researchOpticaFilter, researchOpticaExport, OpticaSearchArgs, OpticaFilterArgs, OpticaExportArgs } from "./flow";

export const researchOpticaSearchInput = objectSchema<OpticaSearchArgs>({
  query: scalar.string("Optica Publishing Group query text; boolean operators are accepted directly in q"),
  page_size: scalar.number("Optional local pageSize parameter"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-optica" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchOpticaFilterInput = objectSchema<OpticaFilterArgs>({
  query: scalar.string("Optica Publishing Group query text"),
  year: scalar.number("Verified year facet, applied by label click plus #apply-all-year"),
  page_size: scalar.number("Optional local pageSize parameter"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-optica" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchOpticaExportInput = objectSchema<OpticaExportArgs>({
  query: scalar.string("Optica search query used to load a result page containing the selected article_id"),
  article_id: scalar.string("Optica input[name=articles] value, e.g. col-22-12-123701"),
  format: { ...scalar.enum(["bibtex", "ris"], "Citation export format"), default: "bibtex" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-optica" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query", "article_id"]);

export const opticaResearchTools = [
  {
    name: "research_optica_search",
    description: "Search Optica Publishing Group via the verified Optica GET search.cfm?q=...&ibsearch=false recipe.",
    schema: researchOpticaSearchInput,
    handler: async (args: OpticaSearchArgs) => researchOpticaSearch(args)
  },
  {
    name: "research_optica_filter",
    description: "Search and refine Optica Publishing Group with the verified visually-hidden year facet label plus Bootstrap Apply flow.",
    schema: researchOpticaFilterInput,
    handler: async (args: OpticaFilterArgs) => researchOpticaFilter(args)
  },
  {
    name: "research_optica_export",
    description: "Export a real selected Optica citation artifact through the verified CDP browser:artifact-click POST form path without synthesized fallback.",
    schema: researchOpticaExportInput,
    handler: async (args: OpticaExportArgs) => researchOpticaExport(args)
  }
];

export { researchOpticaSearch, researchOpticaFilter, researchOpticaExport };
