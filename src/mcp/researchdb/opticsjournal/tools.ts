import { objectSchema, scalar } from "../../../utils/schema";
import { researchOpticsjournalSearch, researchOpticsjournalFilter, researchOpticsjournalExport, OpticsjournalSearchArgs, OpticsjournalFilterArgs, OpticsjournalExportArgs } from "../../../handlers/researchdb/legacy/opticsjournal";

export const researchOpticsjournalSearchInput = objectSchema<OpticsjournalSearchArgs>({
  query: scalar.string("Opticsjournal query text, submitted through input[name=\"_title\"]"),
  field_type: { ...scalar.enum(["title", "author", "keyword", "affiliation", "first_author", "first_affiliation", "abstract", "doi", "cstr"], "Opticsjournal field type"), default: "title" },
  journal_scope: scalar.string("Optional #beSelect2 journal scope value/label"),
  year_from: scalar.number("Optional start publication year; otherwise site applies an implicit latest ~4-year window"),
  year_to: scalar.number("Optional end publication year"),
  sort: scalar.string("Optional sort select value/label"),
  page_size: scalar.number("Optional pageSize select value"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-opticsjournal" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9237 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchOpticsjournalFilterInput = objectSchema<OpticsjournalFilterArgs>({
  query: scalar.string("Opticsjournal query text"),
  field_type: { ...scalar.enum(["title", "author", "keyword", "affiliation", "first_author", "first_affiliation", "abstract", "doi", "cstr"], "Opticsjournal field type"), default: "title" },
  journal_scope: scalar.string("Optional #beSelect2 journal scope value/label"),
  year_from: scalar.number("Optional start publication year"),
  year_to: scalar.number("Optional end publication year"),
  sort: scalar.string("Optional sort select value/label"),
  page_size: scalar.number("Optional pageSize select value"),
  facet: scalar.enum(["journal", "pubyear", "author", "topic_cn", "topic_en"], "Facet group to apply"),
  facet_value: scalar.string("Facet data-value to apply"),
  journal_code: scalar.string("Journal facet data-value, e.g. m00072"),
  pubyear: scalar.number("Publication-year facet data-value, e.g. 2025"),
  author: scalar.string("Author facet data-value"),
  topic_cn: scalar.string("Chinese topic/research-area facet data-value"),
  topic_en: scalar.string("English topic facet data-value"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-opticsjournal" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9237 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchOpticsjournalExportInput = objectSchema<OpticsjournalExportArgs>({
  query: scalar.string("Opticsjournal query text used before selecting page records for export"),
  field_type: { ...scalar.enum(["title", "author", "keyword", "affiliation", "first_author", "first_affiliation", "abstract", "doi", "cstr"], "Opticsjournal field type"), default: "title" },
  journal_scope: scalar.string("Optional #beSelect2 journal scope value/label"),
  year_from: scalar.number("Optional start publication year"),
  year_to: scalar.number("Optional end publication year"),
  sort: scalar.string("Optional sort select value/label"),
  page_size: scalar.number("Optional pageSize select value"),
  facet: scalar.enum(["journal", "pubyear", "author", "topic_cn", "topic_en"], "Optional facet group to apply before export"),
  facet_value: scalar.string("Optional facet data-value to apply before export"),
  journal_code: scalar.string("Optional journal facet data-value"),
  pubyear: scalar.number("Optional publication-year facet data-value"),
  author: scalar.string("Optional author facet data-value"),
  topic_cn: scalar.string("Optional Chinese topic facet data-value"),
  topic_en: scalar.string("Optional English topic facet data-value"),
  format: { ...scalar.enum(["enw", "ref", "txt", "xml"], "Export format"), default: "enw" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-opticsjournal" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9237 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export { researchOpticsjournalSearch, researchOpticsjournalFilter, researchOpticsjournalExport };

export const opticsjournalResearchTools = [
  { name: "research_opticsjournal_search", description: "Search 中国光学期刊网 via the verified /Search advanced-search form with bounded result polling.", schema: researchOpticsjournalSearchInput, handler: researchOpticsjournalSearch },
  { name: "research_opticsjournal_filter", description: "Search 中国光学期刊网 and apply verified Bootstrap facet radio-switch refinements with count/list confirmation.", schema: researchOpticsjournalFilterInput, handler: researchOpticsjournalFilter },
  { name: "research_opticsjournal_export", description: "Export selected 中国光学期刊网 result-page records through the verified CDP browser:artifact-click EndNote path.", schema: researchOpticsjournalExportInput, handler: researchOpticsjournalExport }
];
