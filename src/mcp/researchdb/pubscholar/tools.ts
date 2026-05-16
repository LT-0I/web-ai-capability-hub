import { objectSchema, scalar } from "../../../utils/schema";
import { researchPubscholarSearch, researchPubscholarFilter, researchPubscholarExport, PubscholarSearchArgs, PubscholarFilterArgs, PubscholarExportArgs } from "./flow";

const conditionSchema = scalar.object("PubScholar advanced-search condition: { field: 标题|关键词|作者|机构|摘要|期刊, value, match_mode: 精确|模糊, op: AND|OR|NOT }. Up to three conditions mirror the verified portal rows.");

export const researchPubscholarSearchInput = objectSchema<PubscholarSearchArgs>({
  query: scalar.string("PubScholar advanced-search first condition value; for the verified recipe use 深度学习"),
  keyword: scalar.string("Optional second condition in the 关键词 field; for the verified recipe use 图像识别"),
  field: { ...scalar.enum(["标题", "关键词", "作者", "机构", "摘要", "期刊"], "First condition field"), default: "标题" },
  conditions: scalar.array(conditionSchema, "Optional explicit PubScholar advanced-search conditions (max three UI rows)"),
  page_size: scalar.number("Optional page size hint; PubScholar SPA controls its own page size"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-pubscholar" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchPubscholarFilterInput = objectSchema<PubscholarFilterArgs>({
  query: scalar.string("PubScholar advanced-search first condition value"),
  keyword: scalar.string("Optional second condition in the 关键词 field"),
  field: { ...scalar.enum(["标题", "关键词", "作者", "机构", "摘要", "期刊"], "First condition field"), default: "标题" },
  conditions: scalar.array(conditionSchema, "Optional explicit PubScholar advanced-search conditions"),
  facet_group: scalar.string("Facet group label, e.g. 出版年, 论文类型, 学科分类, 语种"),
  facet_value: scalar.string("Facet value label, e.g. 2025"),
  publication_year: scalar.number("Shortcut for facet_group=出版年 and this year value; defaults to 2025 if no refine is supplied"),
  resource_type: scalar.string("Top resource tab label, e.g. 论文, 科学数据, 科研设施, 开源软件, 专利, 图书"),
  full_text: scalar.boolean("Apply the verified 可获取全文 toggle"),
  page_size: scalar.number("Optional page size hint"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-pubscholar" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchPubscholarExportInput = objectSchema<PubscholarExportArgs>({
  query: scalar.string("PubScholar advanced-search first condition value used before per-record RIS export"),
  keyword: scalar.string("Optional second condition in the 关键词 field"),
  field: { ...scalar.enum(["标题", "关键词", "作者", "机构", "摘要", "期刊"], "First condition field"), default: "标题" },
  conditions: scalar.array(conditionSchema, "Optional explicit PubScholar advanced-search conditions"),
  facet_group: scalar.string("Optional facet group before export"),
  facet_value: scalar.string("Optional facet value before export"),
  publication_year: scalar.number("Optional 出版年 refine before export"),
  resource_type: scalar.string("Optional top resource tab before export"),
  full_text: scalar.boolean("Optionally apply 可获取全文 toggle before export"),
  format: { ...scalar.enum(["ris"], "Export format; PubScholar verified file export is per-record RIS"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-pubscholar" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export { researchPubscholarSearch, researchPubscholarFilter, researchPubscholarExport };

export const pubscholarResearchTools = [
  { name: "research_pubscholar_search", description: "Search PubScholar through the verified Vue advanced-search portal and confirm route-only state via breadcrumb/count DOM.", schema: researchPubscholarSearchInput, handler: researchPubscholarSearch },
  { name: "research_pubscholar_filter", description: "Search PubScholar and apply verified live UI facets/toggles with count and AppSearchRefineItems breadcrumb confirmation.", schema: researchPubscholarFilterInput, handler: researchPubscholarFilter },
  { name: "research_pubscholar_export", description: "Export the first PubScholar result's per-record RIS via the verified CDP browser:artifact-click path; no bulk synthesis.", schema: researchPubscholarExportInput, handler: researchPubscholarExport }
];
