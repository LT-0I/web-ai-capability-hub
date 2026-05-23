import { objectSchema, scalar } from "../../../utils/schema";
import { researchWanfangSearch, researchWanfangFilter, researchWanfangExport, WanfangSearchArgs, WanfangFilterArgs, WanfangExportArgs } from "../../../handlers/researchdb/legacy/wanfang";

export const researchWanfangSearchInput = objectSchema<WanfangSearchArgs>({
  query: scalar.string("Wanfang paper search text; replayed as https://s.wanfangdata.com.cn/paper?q=<query>"),
  page_size: scalar.number("Optional page size hint; Wanfang UI defaults to 20 result rows/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-wanfang" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9238 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchWanfangFilterInput = objectSchema<WanfangFilterArgs>({
  query: scalar.string("Wanfang paper search text used before applying the resource-type facet"),
  resource_type: { ...scalar.enum(["Thesis", "Periodical", "Conference", "Patent"], "Wanfang resource Type facet value"), default: "Thesis" },
  resource_label: scalar.string("Optional visible resource label; defaults map Thesis to 学位论文"),
  page_size: scalar.number("Optional page size hint; Wanfang UI defaults to 20 result rows/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-wanfang" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9238 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchWanfangExportInput = objectSchema<WanfangExportArgs>({
  query: scalar.string("Wanfang paper search text used before selecting the first refined record and exporting a TXT citation"),
  resource_type: { ...scalar.enum(["Thesis", "Periodical", "Conference", "Patent"], "Wanfang resource Type facet value before export"), default: "Thesis" },
  resource_label: scalar.string("Optional visible resource label; defaults map Thesis to 学位论文"),
  format: { ...scalar.enum(["txt"], "Export format"), default: "txt" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  row_index: scalar.number("Zero-based result row index to select; defaults to 0"),
  page_size: scalar.number("Optional page size hint; Wanfang UI defaults to 20 result rows/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-wanfang" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9238 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export { researchWanfangSearch, researchWanfangFilter, researchWanfangExport };

export const wanfangResearchTools = [
  { name: "research_wanfang_search", description: "Search Wanfang Data through the verified replayable paper?q= SPA route and count poll.", schema: researchWanfangSearchInput, handler: researchWanfangSearch },
  { name: "research_wanfang_filter", description: "Search Wanfang Data and apply the two-step iView resource-type facet via trusted CDP clicks with count/url confirmation.", schema: researchWanfangFilterInput, handler: researchWanfangFilter },
  { name: "research_wanfang_export", description: "Search/refine Wanfang Data, trusted-select a result, open 批量引用, and download TXT citation via the CDP artifact-click path.", schema: researchWanfangExportInput, handler: researchWanfangExport }
];
