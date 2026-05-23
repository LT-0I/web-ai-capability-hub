import { objectSchema, scalar } from "../../../utils/schema";
import { researchScieloSearch, researchScieloFilter, researchScieloExport, ScieloSearchArgs, ScieloFilterArgs, ScieloExportArgs } from "../../../handlers/researchdb/legacy/scielo";

export const researchScieloSearchInput = objectSchema<ScieloSearchArgs>({
  query: scalar.string("SciELO boolean query text; inline AND/OR/AND NOT, parentheses, and quotes are supported"),
  lang: { ...scalar.string("SciELO UI language"), default: "pt" },
  count: { ...scalar.number("Result page size"), default: 15 },
  from: { ...scalar.number("Result offset"), default: 0 },
  page: { ...scalar.number("Result page number"), default: 1 },
  sort: scalar.string("Optional SciELO sort key"),
  format: { ...scalar.string("SciELO results format parameter"), default: "summary" },
  profile: { ...scalar.string("Managed browser profile"), default: "research-scielo" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9228 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchScieloFilterInput = objectSchema<ScieloFilterArgs>({
  query: scalar.string("SciELO boolean query text"),
  lang: { ...scalar.string("SciELO UI language"), default: "pt" },
  count: { ...scalar.number("Result page size"), default: 15 },
  from: { ...scalar.number("Result offset"), default: 0 },
  page: { ...scalar.number("Result page number"), default: 1 },
  sort: scalar.string("Optional SciELO sort key"),
  format: { ...scalar.string("SciELO results format parameter"), default: "summary" },
  collection: scalar.string("Collection/country facet value, e.g. scl for Brasil"),
  country: scalar.string("Alias for collection/country facet value, e.g. scl"),
  journal_title: scalar.string("Journal title facet value"),
  language: scalar.string("Language facet value, e.g. en, es, pt"),
  year_cluster: scalar.string("Publication year facet value, e.g. 2021"),
  subject_area: scalar.string("SciELO subject area facet value"),
  wok_subject_categories: scalar.string("WoS subject category facet value"),
  wok_citation_index: scalar.string("WoS citation index facet value"),
  is_citable: scalar.string("Citable facet value, e.g. 1"),
  literature_type: scalar.string("Literature type facet value, e.g. Artigo"),
  network_classification: scalar.string("Network classification facet value"),
  facets: scalar.object("Advanced raw SciELO facet map keyed by filter facet name"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-scielo" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9228 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchScieloExportInput = objectSchema<ScieloExportArgs>({
  query: scalar.string("SciELO boolean query text to export from"),
  lang: { ...scalar.string("SciELO UI language"), default: "pt" },
  count: { ...scalar.number("Result page size; current-page export defaults to 15"), default: 15 },
  from: { ...scalar.number("Result offset"), default: 0 },
  page: { ...scalar.number("Result page number"), default: 1 },
  sort: scalar.string("Optional SciELO sort key"),
  format: { ...scalar.string("SciELO results format parameter"), default: "summary" },
  collection: scalar.string("Collection/country facet value, e.g. scl for Brasil"),
  country: scalar.string("Alias for collection/country facet value, e.g. scl"),
  journal_title: scalar.string("Journal title facet value"),
  language: scalar.string("Language facet value, e.g. en, es, pt"),
  year_cluster: scalar.string("Publication year facet value, e.g. 2021"),
  subject_area: scalar.string("SciELO subject area facet value"),
  wok_subject_categories: scalar.string("WoS subject category facet value"),
  wok_citation_index: scalar.string("WoS citation index facet value"),
  is_citable: scalar.string("Citable facet value, e.g. 1"),
  literature_type: scalar.string("Literature type facet value, e.g. Artigo"),
  network_classification: scalar.string("Network classification facet value"),
  facets: scalar.object("Advanced raw SciELO facet map keyed by filter facet name"),
  export_format: { ...scalar.enum(["ris", "bibtex", "citation", "csv"], "Export format; uses CDP artifact-click, never browser:download-url"), default: "ris" },
  selection: { ...scalar.enum(["current_page", "all_results", "selection"], "SciELO export scope; current_page is the verified default"), default: "current_page" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-scielo" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9228 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const scieloResearchTools = [
  {
    name: "research_scielo_search",
    description: "Search SciELO through the verified deterministic GET replay URL and parse hydrated result counts/items.",
    schema: researchScieloSearchInput,
    handler: async (args: ScieloSearchArgs) => researchScieloSearch(args)
  },
  {
    name: "research_scielo_filter",
    description: "Apply SciELO URL facet refinements such as filter[in][]=scl and confirm selected-filter hydration.",
    schema: researchScieloFilterInput,
    handler: async (args: ScieloFilterArgs) => researchScieloFilter(args)
  },
  {
    name: "research_scielo_export",
    description: "Export a real SciELO artifact via the verified two-step CDP artifact-click modal path; never uses bare download-url because SciELO returns HTTP 403 there.",
    schema: researchScieloExportInput,
    handler: async (args: ScieloExportArgs) => researchScieloExport(args)
  }
];

export { researchScieloSearch, researchScieloFilter, researchScieloExport };
