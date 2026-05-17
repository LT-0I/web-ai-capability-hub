import { objectSchema, scalar } from "../../../utils/schema";
import { researchAiaaSearch, researchAiaaFilter, researchAiaaExport, AiaaSearchArgs, AiaaFilterArgs, AiaaExportArgs } from "./flow";

export const researchAiaaSearchInput = objectSchema<AiaaSearchArgs>({
  query: scalar.string("AIAA query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "AbstractText", "Affiliation"], "AIAA search area"), default: "AllField" },
  page_size: scalar.number("Optional AIAA pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-aiaa" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAiaaFilterInput = objectSchema<AiaaFilterArgs>({
  query: scalar.string("AIAA query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "AbstractText", "Affiliation"], "AIAA search area"), default: "AllField" },
  after_year: scalar.number("AfterYear filter"),
  before_year: scalar.number("BeforeYear filter"),
  series_key: scalar.string("SeriesKey publication facet"),
  contrib_raw: scalar.string("ContribRaw author facet"),
  concept_id: scalar.string("ConceptID topic facet"),
  page_size: scalar.number("Optional AIAA pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-aiaa" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAiaaExportInput = objectSchema<AiaaExportArgs>({
  doi: scalar.string("AIAA DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex", "endnote", "medlars"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-aiaa" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export { researchAiaaSearch, researchAiaaFilter, researchAiaaExport };
