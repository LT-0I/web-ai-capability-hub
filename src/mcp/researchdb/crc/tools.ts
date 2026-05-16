import { objectSchema, scalar } from "../../../utils/schema";
import { researchCrcSearch, researchCrcFilter, researchCrcExport, CrcSearchArgs, CrcFilterArgs, CrcExportArgs } from "./flow";

export const researchCrcSearchInput = objectSchema<CrcSearchArgs>({
  query: scalar.string("CRC/T&F eBooks keyword query text; maps to advanceKeywords"),
  title: scalar.string("Optional advanced-search title field; AND-combined with author/keyword"),
  author: scalar.string("Optional advanced-search author field; AND-combined with title/keyword"),
  keyword: scalar.string("Optional advanced-search keyword field; overrides query when present"),
  page_size: scalar.number("Optional page size hint; CRC/T&F eBooks UI controls pagination in the SPA"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-crc" },
  cdp_port: scalar.number("Optional CDP port override; use 9243 for NUAA CRC"),
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const researchCrcFilterInput = objectSchema<CrcFilterArgs>({
  query: scalar.string("CRC/T&F eBooks keyword query text; maps to advanceKeywords"),
  title: scalar.string("Optional advanced-search title field"),
  author: scalar.string("Optional advanced-search author field"),
  keyword: scalar.string("Optional advanced-search keyword field"),
  access_facet: scalar.enum(["access", "licensed", "open_access", "free_to_view", "forthcoming", "fully_oa_books", "books_with_oa_chapters"], "Verified inline access facet to apply by Material label click"),
  open_access: scalar.boolean("Apply the Open Access inline Material checkbox"),
  free_to_view: scalar.boolean("Apply the Free to View inline Material checkbox"),
  access_content: scalar.boolean("Apply the Content I have access to inline Material checkbox"),
  licensed_content: scalar.boolean("Apply the Licensed Content inline Material checkbox"),
  include_forthcoming: scalar.boolean("Apply the Include Forthcoming inline Material checkbox"),
  fully_oa_books: scalar.boolean("Apply the Fully OA Books inline Material checkbox"),
  books_with_oa_chapters: scalar.boolean("Apply the Books with OA Chapters inline Material checkbox"),
  year_from: scalar.number("Publication year range start; dispatched with Angular input/change/blur events"),
  year_to: scalar.number("Publication year range end; dispatched with Angular input/change/blur events"),
  page_size: scalar.number("Optional page size hint"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-crc" },
  cdp_port: scalar.number("Optional CDP port override; use 9243 for NUAA CRC"),
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const researchCrcExportInput = objectSchema<CrcExportArgs>({
  query: scalar.string("CRC/T&F eBooks keyword query text used before exporting the bulk CSV"),
  title: scalar.string("Optional advanced-search title field"),
  author: scalar.string("Optional advanced-search author field"),
  keyword: scalar.string("Optional advanced-search keyword field"),
  access_facet: scalar.enum(["access", "licensed", "open_access", "free_to_view", "forthcoming", "fully_oa_books", "books_with_oa_chapters"], "Optional verified inline access facet before export"),
  open_access: scalar.boolean("Optionally apply Open Access before export"),
  free_to_view: scalar.boolean("Optionally apply Free to View before export"),
  access_content: scalar.boolean("Optionally apply Content I have access to before export"),
  licensed_content: scalar.boolean("Optionally apply Licensed Content before export"),
  include_forthcoming: scalar.boolean("Optionally apply Include Forthcoming before export"),
  fully_oa_books: scalar.boolean("Optionally apply Fully OA Books before export"),
  books_with_oa_chapters: scalar.boolean("Optionally apply Books with OA Chapters before export"),
  year_from: scalar.number("Optional publication year range start before export"),
  year_to: scalar.number("Optional publication year range end before export"),
  format: { ...scalar.enum(["csv"], "CRC/T&F eBooks supports only the verified bulk CSV export"), default: "csv" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-crc" },
  cdp_port: scalar.number("Optional CDP port override; use 9243 for NUAA CRC"),
  tab_id: scalar.string("Optional managed tab id")
}, []);

export { researchCrcSearch, researchCrcFilter, researchCrcExport };

export const crcResearchTools = [
  { name: "research_crc_search", description: "Search CRC Press / Taylor & Francis eBooks on the distinct taylorfrancis.com UBX eBooks surface via the verified advanced-search replay URL.", schema: researchCrcSearchInput, handler: researchCrcSearch },
  { name: "research_crc_filter", description: "Search CRC/T&F eBooks and apply verified inline Material-checkbox/year filters with result-count-delta confirmation.", schema: researchCrcFilterInput, handler: researchCrcFilter },
  { name: "research_crc_export", description: "Export real CRC/T&F eBooks bulk search results as the platform's fixed 1500-row CSV via the verified modal CDP artifact-click path.", schema: researchCrcExportInput, handler: researchCrcExport }
];
