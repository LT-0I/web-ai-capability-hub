#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE_FILES = [
  "data/gemini_full_catalog.json",
  "data/gemini_canvas_deepresearch_catalog.json",
  "data/gemini_unexplored_catalog.json",
  "data/gemini_remaining_catalog.json"
];

const OUTPUT_FILE = "data/gemini_manual_capabilities.json";

const ALLOWED_CATEGORIES = [
  "chat",
  "canvas",
  "image-generation",
  "video-generation",
  "audio-generation",
  "file-management",
  "navigation",
  "research",
  "settings",
  "download",
  "workspace"
];

const IMPORT_TABLES = [
  "browser_profiles",
  "service_targets",
  "page_captures",
  "ui_elements",
  "capabilities",
  "capability_versions",
  "workflow_definitions",
  "workflow_runs",
  "run_events",
  "artifacts",
  "site_registry_entries",
  "scheduled_jobs",
  "policy_events"
];

const GENERIC_PATH_PARTS = new Set([
  "areas",
  "buttons",
  "attachment_menu_items",
  "model_options",
  "response_actions",
  "response_controls",
  "response_overflow_menu",
  "share_export_menu",
  "conversation_overflow_menu",
  "conversation_item_actions",
  "import_code_dialog",
  "voice_input",
  "nav_items",
  "sections",
  "categories",
  "premade_detail_fields",
  "create_form_fields",
  "create_form_controls",
  "item_actions",
  "notices",
  "extensions",
  "safe_to_modify",
  "account_level_skip",
  "advanced_features",
  "other_sections",
  "features",
  "lightbox_controls",
  "privacy_links_visible",
  "templates_visible",
  "new_action_form",
  "fields",
  "export_options",
  "editor_focused_controls",
  "toolbar_controls",
  "source_types",
  "progress_ui",
  "sources_panel_controls",
  "observed_menu_options",
  "toc_controls",
  "create_menu_options",
  "share_export_options",
  "mini_app_controls",
  "more_options_menu",
  "form_fields",
  "schedule_options",
  "controls",
  "image_actions",
  "hover_actions",
  "search_controls",
  "disabled_features",
  "selection_toolbar",
  "sample_prompts",
  "action_buttons",
  "sub_settings",
  "entry_points",
  "visible_controls",
  "premade_card_actions",
  "items",
  "items_visible",
  "sources_menu"
]);

const SKIP_KEYS = new Set([
  "unexplored",
  "profile_alias",
  "recorded_at",
  "service_id"
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function stableId(name) {
  return `cap_${crypto.createHash("sha1").update(`gemini:${name}`).digest("hex").slice(0, 16)}`;
}

function snakeCase(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

function titleCase(value) {
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanLabel(value) {
  let label = String(value)
    .replace(/[\u{1F300}-\u{1FAFF}\uFE0F]/gu, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  label = label.replace(/^Audio more menu:\s*/i, "");
  label = label.replace(/^Frequency options:\s*/i, "frequency ");
  label = label.replace(/^Weekly day options:\s*/i, "weekly day ");
  label = label.replace(/^Monthly day options:\s*/i, "monthly day ");
  label = label.replace(/^Time options:\s*/i, "time ");
  label = label.replace(/^Default schedule shown:\s*/i, "default schedule ");
  label = label.replace(/^Helper text:\s*/i, "schedule helper text ");
  label = label.replace(/^Readouts:\s*/i, "readouts ");
  label = label.replace(/^Heading:\s*/i, "heading ");
  label = label.replace(/^Preview iframe tabs\/buttons:\s*/i, "preview tabs ");

  // Keep the user-facing action, not implementation or explanatory clauses.
  label = label.replace(/,\s*(disabled|appears|default|displayed|placeholder|aria|observed|not visible|tap|type|role|data|opens|shown|saved|visible|with|requires|and no|no ).*$/i, "");
  label = label.replace(/\s+-\s+.*$/i, "");
  label = label.replace(/\s+\/\s+.*$/i, "");
  label = label.replace(/\b(button|control|controls|action|actions|selector|input|textarea|combobox|switch|chip|menuitemcheckbox|menuitem|menu|field|fields|dialog|option|options)\b$/i, "");
  label = label.replace(/\s+/g, " ").trim();
  return label || String(value);
}

function compactSlug(slug, prefixSlug) {
  let out = slug;
  const prefixParts = prefixSlug.split("_").filter(Boolean);
  const first = prefixParts[0];
  const last = prefixParts[prefixParts.length - 1];

  if (prefixSlug && out === prefixSlug) return "";
  if (prefixSlug && out.startsWith(`${prefixSlug}_`)) out = out.slice(prefixSlug.length + 1);
  if (first && out.startsWith(`${first}_`)) out = out.slice(first.length + 1);
  if (last && out.endsWith(`_${last}`)) out = out.slice(0, -(last.length + 1));

  out = out
    .replace(/^open_/, "")
    .replace(/^deselect_/, "")
    .replace(/^selected_/, "")
    .replace(/^enter_a_/, "enter_")
    .replace(/^text_area_for_/, "")
    .replace(/^input_for_/, "")
    .replace(/^start_a_new_/, "new_")
    .replace(/_button$/, "")
    .replace(/_control$/, "")
    .replace(/_controls$/, "")
    .replace(/_action$/, "")
    .replace(/_actions$/, "")
    .replace(/_selector$/, "")
    .replace(/_dialog$/, "")
    .replace(/_menu$/, "")
    .replace(/_field$/, "")
    .replace(/_fields$/, "")
    .replace(/_input$/, "")
    .replace(/_textarea$/, "")
    .replace(/_combobox$/, "")
    .replace(/_switch$/, "")
    .replace(/_chip$/, "")
    .replace(/_image$/, "")
    .replace(/_video$/, "")
    .replace(/_track$/, "_audio")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  if (out === "download_full_size") return out;
  if (out === "download_audio_audio") return "download_audio";
  if (out === "share_audio_audio") return "share_audio";
  if (out === "play_audio_audio") return "play_audio";
  return out || slug;
}

function sourcePathToString(sourceFile, pathParts) {
  return `${sourceFile} > ${pathParts.join(".")}`;
}

function formatDetails(details) {
  if (typeof details === "string") return details;
  return JSON.stringify(details, null, 2);
}

function nonEmptyObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function inferInputs(details) {
  if (!details || typeof details !== "object") return undefined;
  const inputs = {};
  for (const key of [
    "fields",
    "form_fields",
    "source_types",
    "schedule_options",
    "supported_formats",
    "upload_controls",
    "sample_prompts",
    "prompt",
    "placeholder",
    "input_type",
    "role",
    "default",
    "default_selected",
    "current_value"
  ]) {
    if (details[key] !== undefined) inputs[key] = details[key];
  }
  if (details.label && /textbox|textarea|prompt|input|combobox|upload|files|source|schedule/i.test(JSON.stringify(details))) {
    inputs.control = details.label;
  }
  return nonEmptyObject(inputs) ? inputs : undefined;
}

function inferOutputs(details) {
  if (!details || typeof details !== "object") return undefined;
  const outputs = {};
  for (const key of [
    "output_type",
    "question_format",
    "controls",
    "response_controls",
    "image_actions",
    "action_buttons",
    "share_export_options",
    "create_menu_options",
    "toc_controls",
    "mini_app_controls",
    "more_options_menu",
    "observed_options",
    "observed_menu_options",
    "visible_controls",
    "notes",
    "description",
    "description_observed",
    "banner_text",
    "disabled_features",
    "templates_visible",
    "lightbox_controls",
    "source_types"
  ]) {
    if (details[key] !== undefined) outputs[key] = details[key];
  }
  return nonEmptyObject(outputs) ? outputs : undefined;
}

function inferPreconditions(details, inherited = []) {
  const preconditions = [...inherited];
  if (details && typeof details === "object") {
    for (const key of ["activation", "activation_method", "trigger_method", "trigger_button", "entry_point"]) {
      if (details[key]) preconditions.push(String(details[key]));
    }
    if (Array.isArray(details.entry_points)) {
      preconditions.push(...details.entry_points.map((entry) => `Entry point: ${entry}`));
    }
    if (details.default_selected !== undefined) preconditions.push(`Default selected: ${details.default_selected}`);
    if (details.state !== undefined) preconditions.push(`Observed state: ${details.state}`);
    if (details.disabled === true) preconditions.push("Observed disabled");
  }
  return [...new Set(preconditions)].filter(Boolean);
}

function pathIncludes(pathParts, pattern) {
  return pathParts.join(".").toLowerCase().includes(pattern);
}

function inferCategory(pathParts, label, details) {
  const pathText = pathParts.join(".").toLowerCase();
  const labelText = String(label || "").toLowerCase();
  const detailsText = typeof details === "string" ? details.toLowerCase() : JSON.stringify(details || {}).toLowerCase();
  const all = `${pathText} ${labelText} ${detailsText}`;

  if (/\b(download|export to docs|export to sheets|copy contents|copy table|copy image|copy audio|copy video|download full size|download video|download track|download audio)\b/.test(all)) {
    return "download";
  }
  if (/\b(upload|file|files|drive|photos|github repository|import code|knowledge|source file|folder)\b/.test(all)) {
    return "file-management";
  }
  if (/\b(image|infographic|synthid|lightbox|media)\b/.test(all)) {
    return pathIncludes(pathParts, "canvas") && !/\bimage_creation|create_image|share image|copy image|download full size image\b/.test(all) ? "canvas" : "image-generation";
  }
  if (/\b(video|veo|play video|mute video|seek slider)\b/.test(all)) {
    return pathIncludes(pathParts, "canvas") ? "canvas" : "video-generation";
  }
  if (/\b(music|audio|track|listen|microphone|play audio|mute track|podcast|narration|playback speed|replay 10|forward 10)\b/.test(all)) {
    return pathIncludes(pathParts, "canvas") && !/\baudio overview|audio track|download audio|share audio|play audio\b/.test(all) ? "canvas" : "audio-generation";
  }
  if (/\b(canvas|flashcards|quiz|web page|select and ask|create menu|code\/preview|preview iframe)\b/.test(all)) {
    return "canvas";
  }
  if (/\b(deep research|research|sources|toc|contents|source chips|source domains|google search|openstax|guided learning|visualization|learn|lesson|websites)\b/.test(all)) {
    return "research";
  }
  if (/\b(gem|gems|notebook|notebooklm|workspace|gmail|calendar|docs|keep|tasks|youtube|connected apps|public links|share conversation|share report|share canvas|share audio|share track|share video)\b/.test(all)) {
    return "workspace";
  }
  if (/\b(settings|theme|personal intelligence|activity|scheduled actions|subscription|upgrade|privacy|location|memory|feedback|help|mode picker|fast|thinking|pro)\b/.test(all)) {
    return "settings";
  }
  if (/\b(sidebar|navigation|new chat|temporary chat|search for chats|recent results|my stuff|conversation|pin|rename|delete|go to chat|back button)\b/.test(all)) {
    return "navigation";
  }
  return "chat";
}

function inferPrefix(pathParts, label) {
  const pathText = pathParts.join(".").toLowerCase();
  const labelText = String(label || "").toLowerCase();
  const all = `${pathText} ${labelText}`;

  if (all.includes("scheduled_actions") || all.includes("scheduled actions") || all.includes("scheduled action")) return "scheduled_actions";
  if (all.includes("deep_research_post_report") || all.includes("deep_research") || all.includes("deep research")) return "deep_research";
  if (all.includes("guided_learning") || all.includes("guided learning")) return "guided_learning";
  if (all.includes("canvas_create_outputs") || all.includes("canvas_custom_app") || all.includes("canvas_select_and_ask") || all.includes("canvas")) return "canvas";
  if (all.includes("image_creation") || all.includes("create image") || /\bimage\b/.test(all)) return "image";
  if (all.includes("video_creation") || all.includes("create video") || /\bvideo\b/.test(all)) return "video";
  if (all.includes("music_creation") || all.includes("create music") || /\bmusic\b/.test(all)) return "music";
  if (/\baudio\b/.test(all)) return "audio";
  if (all.includes("import_code")) return "import_code";
  if (all.includes("attachment_menu_items") || /\bupload|drive|photos|file|files\b/.test(all)) return "file";
  if (all.includes("conversation_management")) return "conversation";
  if (all.includes("temporary_chat") || all.includes("temporary chat")) return "temporary_chat";
  if (all.includes("public_links") || all.includes("public links")) return "public_links";
  if (all.includes("personal_intelligence") || all.includes("personal intelligence")) return "personal_intelligence";
  if (all.includes("import_memory") || all.includes("import memory")) return "import_memory";
  if (all.includes("activity")) return "activity";
  if (all.includes("extension")) return "extension";
  if (all.includes("gems") || /\bgem\b/.test(all)) return "gems";
  if (all.includes("notebook")) return "notebooks";
  if (all.includes("settings")) return "settings";
  if (all.includes("sidebar") || all.includes("navigation") || all.includes("search for chats")) return "navigation";
  if (all.includes("chat_input")) return "chat";
  return pathParts.filter((part) => !GENERIC_PATH_PARTS.has(part)).slice(-2).join("_") || "gemini";
}

function inferLabelFromKey(key) {
  return titleCase(key);
}

function makeName(prefix, label, usedNames) {
  const prefixSlug = snakeCase(prefix || "gemini");
  const labelSlug = compactSlug(snakeCase(cleanLabel(label)), prefixSlug);
  let base = [prefixSlug, labelSlug].filter(Boolean).join("_");
  base = base
    .replace(/^canvas_audio_overview_audio_overview$/, "canvas_audio_overview")
    .replace(/^image_download_full_size$/, "image_download_full_size")
    .replace(/^scheduled_actions_create$/, "scheduled_actions_create")
    .replace(/_more_options_more_options$/, "_more_options")
    .replace(/_share_export_share_export$/, "_share_export")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!base) base = prefixSlug || "gemini_capability";
  let candidate = base;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function buildDescription({ title, sourceFile, pathParts, observedAt, details, parentDetails }) {
  const normalizedDetails = parentDetails === undefined ? details : {
    item: details,
    parent_context: parentDetails
  };

  return [
    title,
    `Source path: ${sourcePathToString(sourceFile, pathParts)}`,
    `Observed at: ${observedAt}`,
    "Details:",
    formatDetails(normalizedDetails)
  ].join("\n");
}

class CapabilityBuilder {
  constructor(sourceFile, sourceData, usedNames) {
    this.sourceFile = sourceFile;
    this.sourceData = sourceData;
    this.usedNames = usedNames;
    this.records = [];
    this.observedAt = sourceData.recorded_at || sourceData.recordedAt || new Date().toISOString();
  }

  add({ label, prefix, category, pathParts, details, parentDetails, inputs, outputs, preconditions }) {
    if (!label) return;
    const name = makeName(prefix || inferPrefix(pathParts, label), label, this.usedNames);
    const finalCategory = category || inferCategory(pathParts, label, details);
    if (!ALLOWED_CATEGORIES.includes(finalCategory)) {
      throw new Error(`Internal conversion error: unsupported category '${finalCategory}' for ${name}`);
    }
    const title = titleCase(cleanLabel(label));
    const record = {
      id: stableId(name),
      target_id: "gemini",
      category: finalCategory,
      name,
      description: buildDescription({
        title,
        sourceFile: this.sourceFile,
        pathParts,
        observedAt: this.observedAt,
        details,
        parentDetails
      }),
      selectors: [],
      status: "active",
      confidence: 0.9,
      evidence: {
        source: "manual_exploration",
        observed_at: this.observedAt
      },
      updated_at: this.observedAt
    };

    const inferredInputs = inputs !== undefined ? inputs : inferInputs(details);
    const inferredOutputs = outputs !== undefined ? outputs : inferOutputs(details);
    const inferredPreconditions = preconditions !== undefined ? preconditions : inferPreconditions(details);
    if (inferredInputs !== undefined) record.inputs = inferredInputs;
    if (inferredOutputs !== undefined) record.outputs = inferredOutputs;
    record.preconditions = inferredPreconditions || [];

    this.records.push(record);
  }

  addComposite(pathParts, label, details, parentDetails) {
    this.add({
      label,
      prefix: inferPrefix(pathParts, label),
      category: inferCategory(pathParts, label, details),
      pathParts,
      details,
      parentDetails
    });
  }

  addPrimitive(pathParts, value, parentDetails) {
    this.add({
      label: value,
      prefix: inferPrefix(pathParts, value),
      category: inferCategory(pathParts, value, parentDetails || value),
      pathParts,
      details: value,
      parentDetails,
      inputs: undefined,
      outputs: parentDetails && typeof parentDetails === "object" ? inferOutputs(parentDetails) : undefined,
      preconditions: inferPreconditions(parentDetails)
    });
  }
}

function shouldSkipPath(pathParts) {
  if (pathParts.some((part) => SKIP_KEYS.has(part))) return true;

  const pathText = pathParts.join(".").toLowerCase();
  // The source files do not include saved sidebar chat-history titles, but keep
  // this guard so a later snapshot cannot import those titles as capabilities.
  if (pathText.includes("sidebar") && /chat.*(title|history)|history.*title|conversation.*title/.test(pathText)) {
    return true;
  }
  return false;
}

function objectLabel(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value.label || value.name || value.gem || value.scope || value.title || value.page_heading || value.trigger_button || value.activation || value.activation_method || value.trigger_method || inferLabelFromKey(key);
}

function shouldRecordComposite(value, key, pathParts) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (shouldSkipPath(pathParts)) return false;
  if (["areas", "new_action_form", "main_container"].includes(key)) return false;
  if (Object.keys(value).length === 0) return false;

  const hasExplicitLabel = Boolean(value.label || value.name || value.gem || value.scope || value.title || value.page_heading || value.trigger_button);
  const isNamedFeatureKey = !GENERIC_PATH_PARTS.has(key) && !SKIP_KEYS.has(key);
  const hasSemanticDetail = Object.keys(value).some((innerKey) => !["selector_observed", "visible_title", "visible_document_heading"].includes(innerKey));
  return hasExplicitLabel || (isNamedFeatureKey && hasSemanticDetail);
}

function shouldRecordStringArray(pathParts) {
  if (shouldSkipPath(pathParts)) return false;
  const key = pathParts[pathParts.length - 1] || "";
  if (["account_level_skip"].includes(key)) return false;
  return GENERIC_PATH_PARTS.has(key) || /(controls|actions|options|features|items|templates|prompts|sections|links|fields|sources|menu|toolbar|buttons|formats|outputs)/i.test(key);
}

function traverse(builder, value, pathParts = [], parentDetails = undefined) {
  if (shouldSkipPath(pathParts)) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const itemPath = [...pathParts, String(index)];
      if (typeof item === "string") {
        if (shouldRecordStringArray(pathParts)) builder.addPrimitive(itemPath, item, parentDetails);
        return;
      }
      if (item && typeof item === "object") {
        const key = objectLabel(item, pathParts[pathParts.length - 1] || `item_${index}`);
        if (shouldRecordComposite(item, key, itemPath)) {
          builder.addComposite(itemPath, key, item, parentDetails);
        }
        traverse(builder, item, itemPath, item);
      }
    });
    return;
  }

  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...pathParts, key];
    if (shouldSkipPath(childPath)) continue;

    if (Array.isArray(child)) {
      traverse(builder, child, childPath, value);
      continue;
    }

    if (child && typeof child === "object") {
      if (shouldRecordComposite(child, key, childPath)) {
        builder.addComposite(childPath, objectLabel(child, key), child, value);
      }
      traverse(builder, child, childPath, child);
    }
  }
}

function normalizeImportantNames(records) {
  const renames = [
    {
      match: (record) => record.description.includes("Source path: data/gemini_unexplored_catalog.json > canvas_create_outputs.audio_overview") && record.description.includes("duration 5:24"),
      target: "canvas_audio_overview",
      category: "audio-generation"
    },
    {
      match: (record) => record.description.includes("Export to Docs") && record.description.includes("data/gemini_canvas_deepresearch_catalog.json > canvas.export_options") && record.name.startsWith("canvas_"),
      target: "canvas_export_to_docs",
      category: "download"
    },
    {
      match: (record) => record.description.includes("Download full size image") && record.description.includes("image_actions"),
      target: "image_download_full_size",
      category: "download"
    },
    {
      match: (record) => record.description.includes("Create button") && record.description.includes("scheduled_actions.form_fields"),
      target: "scheduled_actions_create",
      category: "settings"
    }
  ];

  const occupied = new Map(records.map((record) => [record.name, record]));
  const nextAvailableName = (base) => {
    let index = 2;
    let candidate = `${base}_${index}`;
    while (occupied.has(candidate)) {
      index += 1;
      candidate = `${base}_${index}`;
    }
    return candidate;
  };

  for (const rename of renames) {
    const record = records.find(rename.match);
    if (!record || record.name === rename.target) continue;
    const conflict = occupied.get(rename.target);
    if (conflict && conflict !== record) {
      const replacement = nextAvailableName(rename.target);
      occupied.delete(conflict.name);
      conflict.name = replacement;
      conflict.id = stableId(conflict.name);
      occupied.set(conflict.name, conflict);
    }
    occupied.delete(record.name);
    record.name = rename.target;
    record.id = stableId(record.name);
    if (rename.category) record.category = rename.category;
    occupied.set(record.name, record);
  }
}

function makeImportPayload(records) {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString()
  };
  for (const table of IMPORT_TABLES) payload[table] = [];
  payload.capabilities = records;
  return payload;
}

function convertSourceFiles({ rootDir = process.cwd(), sourceFiles = SOURCE_FILES } = {}) {
  const usedNames = new Set();
  const records = [];
  for (const sourceFile of sourceFiles) {
    const fullPath = path.resolve(rootDir, sourceFile);
    const data = readJson(fullPath);
    const builder = new CapabilityBuilder(sourceFile, data, usedNames);
    traverse(builder, data, [], undefined);
    records.push(...builder.records);
  }
  normalizeImportantNames(records);
  return makeImportPayload(records);
}

function writeConverted({ rootDir = process.cwd(), outFile = OUTPUT_FILE } = {}) {
  const payload = convertSourceFiles({ rootDir });
  const outPath = path.resolve(rootDir, outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return {
    outFile,
    outPath,
    records_converted: payload.capabilities.length,
    sample_names: payload.capabilities.slice(0, 10).map((record) => record.name)
  };
}

if (require.main === module) {
  const result = writeConverted();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  ALLOWED_CATEGORIES,
  SOURCE_FILES,
  OUTPUT_FILE,
  convertSourceFiles,
  writeConverted,
  snakeCase,
  inferCategory
};
