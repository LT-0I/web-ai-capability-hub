import { objectSchema, scalar } from "../../../utils/schema";
import { researchArxivSearch, researchArxivFilter, researchArxivExport, ArxivSearchArgs, ArxivFilterArgs, ArxivExportArgs } from "../../../handlers/researchdb/legacy/arxiv";

const termSchema = objectSchema({
  term: scalar.string("arXiv advanced-search term"),
  field: scalar.enum(["all", "title", "author", "abstract", "comments", "journal_ref", "acm_class", "msc_class", "report_num", "paper_id", "doi", "orcid", "license", "author_id", "help", "full_text"], "arXiv term field"),
  operator: scalar.enum(["AND", "OR", "NOT"], "Boolean operator for this term row")
}, ["term"]);

export const researchArxivSearchInput = objectSchema<ArxivSearchArgs>({
  query: scalar.string("arXiv query text for a single advanced-search row"),
  field: { ...scalar.enum(["all", "title", "author", "abstract", "comments", "journal_ref", "acm_class", "msc_class", "report_num", "paper_id", "doi", "orcid", "license", "author_id", "help", "full_text"], "arXiv search field"), default: "all" },
  terms: { type: "array", items: termSchema, description: "Optional arXiv advanced-search rows with operator/field/term" } as any,
  page_size: { ...scalar.number("Results per page; verified values include 25, 50, 100, 200"), default: 50 },
  order: { ...scalar.enum(["-announced_date_first", "announced_date_first", "-submitted_date", "submitted_date", ""], "arXiv sort order"), default: "-announced_date_first" },
  profile: { ...scalar.string("Managed browser profile"), default: "research-arxiv" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9257 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const researchArxivFilterInput = objectSchema<ArxivFilterArgs>({
  query: scalar.string("arXiv query text for a single advanced-search row"),
  field: { ...scalar.enum(["all", "title", "author", "abstract", "comments", "journal_ref", "acm_class", "msc_class", "report_num", "paper_id", "doi", "orcid", "license", "author_id", "help", "full_text"], "arXiv search field"), default: "all" },
  terms: { type: "array", items: termSchema, description: "Optional arXiv advanced-search rows with operator/field/term" } as any,
  subject: scalar.string('Subject classification suffix, e.g. "computer_science" for classification-computer_science=y'),
  physics_archive: { ...scalar.string("Physics archive facet value"), default: "all" },
  include_cross_list: { ...scalar.enum(["include", "exclude"], "Cross-list facet"), default: "include" },
  date_filter_by: { ...scalar.enum(["all_dates", "past_12", "specific_year", "date_range"], "Date filter mode"), default: "all_dates" },
  year: scalar.number("Specific year facet, e.g. 2021"),
  from_date: scalar.string("Date-range start YYYY[-MM[-DD]]"),
  to_date: scalar.string("Date-range end YYYY[-MM[-DD]]"),
  date_type: { ...scalar.enum(["submitted_date", "submitted_date_first", "announced_date_first"], "Date type"), default: "submitted_date" },
  abstracts: { ...scalar.enum(["show", "hide"], "Show or hide abstracts"), default: "show" },
  include_older_versions: scalar.boolean("Include older versions"),
  page_size: { ...scalar.number("Results per page"), default: 50 },
  order: { ...scalar.enum(["-announced_date_first", "announced_date_first", "-submitted_date", "submitted_date", ""], "arXiv sort order"), default: "-announced_date_first" },
  profile: { ...scalar.string("Managed browser profile"), default: "research-arxiv" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9257 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const researchArxivExportInput = objectSchema<ArxivExportArgs>({
  id: scalar.string("arXiv identifier, e.g. 2112.13819"),
  format: { ...scalar.enum(["bibtex"], "Verified arXiv export format"), default: "bibtex" },
  filename: scalar.string("Optional BibTeX filename"),
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-arxiv" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9257 },
  tab_id: scalar.string("Optional managed tab id")
}, ["id"]);

export const arxivResearchTools = [
  {
    name: "research_arxiv_search",
    description: "Search arXiv advanced search with verified term/operator/field query parameters and parse result count/items.",
    schema: researchArxivSearchInput,
    handler: async (args: ArxivSearchArgs) => researchArxivSearch(args)
  },
  {
    name: "research_arxiv_filter",
    description: "Apply verified arXiv advanced-search refinements such as specific year, subject classification, size, and sort order.",
    schema: researchArxivFilterInput,
    handler: async (args: ArxivFilterArgs) => researchArxivFilter(args)
  },
  {
    name: "research_arxiv_export",
    description: "Export a real arXiv per-article BibTeX file via the canonical /bibtex/<id> endpoint; no synthesis or fallback.",
    schema: researchArxivExportInput,
    handler: async (args: ArxivExportArgs) => researchArxivExport(args)
  }
];

export { researchArxivSearch, researchArxivFilter, researchArxivExport };
