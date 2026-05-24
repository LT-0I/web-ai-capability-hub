export const VENDOR_BROWSER_TOOL_NAMES = Object.freeze({
  GET_WINDOWS_AND_TABS: "get_windows_and_tabs",
  NAVIGATE: "chrome_navigate",
  SCREENSHOT: "chrome_screenshot",
  CLOSE_TABS: "chrome_close_tabs",
  SWITCH_TAB: "chrome_switch_tab",
  WEB_FETCHER: "chrome_get_web_content",
  CLICK: "chrome_click_element",
  FILL: "chrome_fill_or_select",
  REQUEST_ELEMENT_SELECTION: "chrome_request_element_selection",
  GET_INTERACTIVE_ELEMENTS: "chrome_get_interactive_elements",
  NETWORK_CAPTURE: "chrome_network_capture",
  NETWORK_CAPTURE_START: "chrome_network_capture_start",
  NETWORK_CAPTURE_STOP: "chrome_network_capture_stop",
  NETWORK_REQUEST: "chrome_network_request",
  NETWORK_DEBUGGER_START: "chrome_network_debugger_start",
  NETWORK_DEBUGGER_STOP: "chrome_network_debugger_stop",
  KEYBOARD: "chrome_keyboard",
  INJECT_SCRIPT: "chrome_inject_script",
  SEND_COMMAND_TO_INJECT_SCRIPT: "chrome_send_command_to_inject_script",
  JAVASCRIPT: "chrome_javascript",
  CONSOLE: "chrome_console",
  FILE_UPLOAD: "chrome_upload_file",
  READ_PAGE: "chrome_read_page",
  COMPUTER: "chrome_computer",
  HANDLE_DIALOG: "chrome_handle_dialog",
  HANDLE_DOWNLOAD: "chrome_handle_download",
  PERFORMANCE_START_TRACE: "performance_start_trace",
  PERFORMANCE_STOP_TRACE: "performance_stop_trace",
  PERFORMANCE_ANALYZE_INSIGHT: "performance_analyze_insight"
} as const);

export type VendorBrowserToolName = typeof VENDOR_BROWSER_TOOL_NAMES[keyof typeof VENDOR_BROWSER_TOOL_NAMES];

export type BrowserBridgeControlMethod = "browser.ping" | "browser.finalize";
export type BridgeMethod = BrowserBridgeControlMethod | VendorBrowserToolName;

export interface BridgeRequest<TParams = unknown> {
  jsonrpc: "2.0";
  id: string | number;
  method: BridgeMethod;
  params?: TParams;
}

export interface BridgeError {
  code: string | number;
  message: string;
  data?: unknown;
}

export interface BridgeResponse<TResult = unknown> {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: TResult;
  error?: BridgeError;
}

export const DESIGN_TAB_METHOD_TO_VENDOR_WIRE = Object.freeze({
  getInfo: VENDOR_BROWSER_TOOL_NAMES.GET_WINDOWS_AND_TABS,
  navigate: VENDOR_BROWSER_TOOL_NAMES.NAVIGATE,
  waitForSelector: VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT,
  queryElements: VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT,
  elementState: VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT,
  elementBox: VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT,
  click: VENDOR_BROWSER_TOOL_NAMES.CLICK,
  fill: VENDOR_BROWSER_TOOL_NAMES.FILL,
  press: VENDOR_BROWSER_TOOL_NAMES.KEYBOARD,
  evaluateReadOnly: VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT,
  textSnapshot: VENDOR_BROWSER_TOOL_NAMES.WEB_FETCHER,
  assetsList: VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT,
  assetsBundle: VENDOR_BROWSER_TOOL_NAMES.JAVASCRIPT,
  close: VENDOR_BROWSER_TOOL_NAMES.CLOSE_TABS
} as const);

export type DesignTabMethod = keyof typeof DESIGN_TAB_METHOD_TO_VENDOR_WIRE;
