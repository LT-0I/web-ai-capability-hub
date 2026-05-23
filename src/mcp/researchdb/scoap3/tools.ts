import { objectSchema, scalar } from "../../../utils/schema";
import { researchScoap3Search, researchScoap3Filter, researchScoap3Export, Scoap3SearchArgs, Scoap3FilterArgs, Scoap3ExportArgs } from "../../../handlers/researchdb/legacy/scoap3";

const stringArray = { type: "array", items: scalar.string("Facet value"), description: "Repeatable SCOAP3 facet values" } as any;

export const researchScoap3SearchInput = objectSchema<Scoap3SearchArgs>({
  query: scalar.string("SCOAP3 search_simple_query_string text; do not use dead q= param"),
  page: scalar.number("Optional result page"),
  size: scalar.number("Optional result page size"),
  sort: scalar.string("Optional SCOAP3 sort value"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-scoap3" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9232 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchScoap3FilterInput = objectSchema<Scoap3FilterArgs>({
  query: scalar.string("SCOAP3 search_simple_query_string text"),
  journal: { ...stringArray, description: "Journal facet(s), e.g. Physical Review Letters" },
  country: { ...stringArray, description: "Country/region facet(s), e.g. Germany" },
  country_logic: { ...scalar.enum(["AND", "OR"], "Country facet logic toggle"), default: "AND" },
  publication_year_gte: scalar.number("Lower publication year; emits publication_year__gte=YYYY-01-01"),
  publication_year_lte: scalar.number("Upper publication year; emits publication_year__lte=YYYY-12-31"),
  page: scalar.number("Optional result page"),
  size: scalar.number("Optional result page size"),
  sort: scalar.string("Optional SCOAP3 sort value"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-scoap3" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9232 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchScoap3ExportInput = objectSchema<Scoap3ExportArgs>({
  query: scalar.string("SCOAP3 search text for result-set CSV/JSON export"),
  journal: { ...stringArray, description: "Journal facet(s) carried into the result-set export URL" },
  country: { ...stringArray, description: "Country facet(s) carried into the result-set export URL" },
  country_logic: { ...scalar.enum(["AND", "OR"], "Country facet logic toggle"), default: "AND" },
  publication_year_gte: scalar.number("Lower publication year"),
  publication_year_lte: scalar.number("Upper publication year"),
  record_id: scalar.number("Optional numeric record id for /api/records/{id}/ JSON export"),
  format: { ...scalar.enum(["csv", "json"], "SCOAP3 result-set export format; bibtex/ris/xml are not offered and are not synthesized"), default: "csv" },
  filename: scalar.string("Optional output filename"),
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-scoap3" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9232 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const scoap3ResearchTools = [
  {
    name: "research_scoap3_search",
    description: "Search SCOAP3 Repository through the verified search_simple_query_string URL contract and parse hydrated counts/items.",
    schema: researchScoap3SearchInput,
    handler: async (args: Scoap3SearchArgs) => researchScoap3Search(args)
  },
  {
    name: "research_scoap3_filter",
    description: "Apply verified SCOAP3 facets (journal, country logic, publication-year range) and confirm hydrated results/export href.",
    schema: researchScoap3FilterInput,
    handler: async (args: Scoap3FilterArgs) => researchScoap3Filter(args)
  },
  {
    name: "research_scoap3_export",
    description: "Export real SCOAP3 result-set CSV/JSON or per-record JSON via the verified open API; no RIS/BibTeX/XML synthesis.",
    schema: researchScoap3ExportInput,
    handler: async (args: Scoap3ExportArgs) => researchScoap3Export(args)
  }
];

export { researchScoap3Search, researchScoap3Filter, researchScoap3Export };
