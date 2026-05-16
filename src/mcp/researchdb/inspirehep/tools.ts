import { objectSchema, scalar } from "../../../utils/schema";
import { researchInspirehepSearch, researchInspirehepFilter, researchInspirehepExport, InspirehepSearchArgs, InspirehepFilterArgs, InspirehepExportArgs } from "./flow";

export const researchInspirehepSearchInput = objectSchema<InspirehepSearchArgs>({
  query: scalar.string('INSPIRE-HEP SPIRES-style structured query, e.g. "t neutrino and t oscillation"'),
  page_size: { ...scalar.number("Results per page; verified value 25"), default: 25 },
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-inspirehep" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9227 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchInspirehepFilterInput = objectSchema<InspirehepFilterArgs>({
  query: scalar.string('INSPIRE-HEP SPIRES-style structured query, e.g. "t neutrino and t oscillation"'),
  doc_type: scalar.string('Document Type facet value, e.g. "article"'),
  author_count: scalar.string('Number-of-authors facet value, e.g. "Single author"'),
  rpp: scalar.string("Exclude Review of Particle Physics facet value"),
  author: scalar.string("Author facet value"),
  subject: scalar.string("Subject facet value"),
  arxiv_category: scalar.string('arXiv category facet value, e.g. "hep-ph"'),
  collaboration: scalar.string("Collaboration facet value"),
  earliest_date: scalar.string("Date-of-paper URL range value, e.g. YYYY--YYYY"),
  facet: scalar.enum(["doc_type", "author_count", "rpp", "author", "subject", "arxiv_categories", "collaboration"], "Generic INSPIRE-HEP facet parameter"),
  facet_value: scalar.string("Generic facet visible checkbox value"),
  page_size: { ...scalar.number("Results per page; verified value 25"), default: 25 },
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-inspirehep" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9227 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchInspirehepExportInput = objectSchema<InspirehepExportArgs>({
  control_number: scalar.string("INSPIRE-HEP literature control number for per-record export"),
  query: scalar.string("Structured query for result-set export"),
  doc_type: scalar.string('Optional result-set Document Type facet, e.g. "article"'),
  size: { ...scalar.number("Result-set export size; verified size 10"), default: 10 },
  format: { ...scalar.enum(["bibtex", "latex-eu", "latex-us", "json", "cv"], "INSPIRE-HEP first-party export format"), default: "bibtex" },
  filename: scalar.string("Optional output filename"),
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-inspirehep" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9227 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const inspirehepResearchTools = [
  {
    name: "research_inspirehep_search",
    description: "Search INSPIRE-HEP by driving the hydrated SPA search box with SPIRES-style structured query syntax; avoids cold deep-link XHR aborts.",
    schema: researchInspirehepSearchInput,
    handler: async (args: InspirehepSearchArgs) => researchInspirehepSearch(args)
  },
  {
    name: "research_inspirehep_filter",
    description: "Apply verified INSPIRE-HEP facet checkboxes such as doc_type=article and confirm the hydrated result count/URL.",
    schema: researchInspirehepFilterInput,
    handler: async (args: InspirehepFilterArgs) => researchInspirehepFilter(args)
  },
  {
    name: "research_inspirehep_export",
    description: "Export real INSPIRE-HEP records or result sets from first-party /api/literature endpoints in BibTeX/LaTeX/JSON/CV formats.",
    schema: researchInspirehepExportInput,
    handler: async (args: InspirehepExportArgs) => researchInspirehepExport(args)
  }
];

export { researchInspirehepSearch, researchInspirehepFilter, researchInspirehepExport };
