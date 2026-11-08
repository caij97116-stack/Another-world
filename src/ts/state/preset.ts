/**
 * Type contracts for the legacy preset editor state.
 *
 * Preset payloads and wrapper objects intentionally remain open records so
 * unknown Tavern fields survive import, editing, local persistence, and export.
 */

export type PresetRecord = Record<string, unknown>;
export type PresetArrayPath = string[];
export type PresetArrayPathMap = Record<string, PresetArrayPath>;

/**
 * Metadata for files that wrap their actual preset payload under a key such
 * as "preset", "data", "settings", or "config".
 */
export interface PresetEnvelope {
  key: string;
  wrapper: PresetRecord;
}

export interface PresetStateContract {
  presetData: PresetRecord | null;
  presetVersion: number;
  presetSaveTimer: ReturnType<typeof setTimeout> | null;
  presetDirty: boolean;
  presetEnvelope: PresetEnvelope | null;
  presetArrayPaths: PresetArrayPathMap;
}

export interface PresetStorageKeys {
  readonly storage: "tavern_preset_editor_data";
  readonly version: "tavern_preset_editor_version";
  readonly envelope: "tavern_preset_editor_envelope";
  readonly arrayPaths: "tavern_preset_editor_array_paths";
}

export interface ParsedPresetImport {
  data: PresetRecord;
  envelope: PresetEnvelope | null;
}

const PRESET_PAYLOAD_SIGNATURES = [
  "prompts", "prompt_order", "temperature", "top_p", "top_k",
  "max_tokens", "max_length", "main_prompt", "system_prompt",
  "jailbreak_prompt", "stop_sequence", "stop_sequences",
  "regex_scripts", "regexScripts", "regex", "regexes", "scripts",
  "tavern_helper_scripts", "tavernhelper_scripts", "tavernHelperScripts",
  "mjs_scripts", "repetition_penalty", "rep_pen"
] as const;

const PRESET_WRAPPER_KEYS = [
  "preset", "data", "settings", "config", "completion_preset", "completionPreset"
] as const;

const NESTED_ARRAY_SIGNATURES: ReadonlyArray<readonly [string, string]> = [
  ["extensions", "regex_scripts"],
  ["extensions", "regexScripts"],
  ["extensions", "scripts"],
  ["extensions", "tavern_helper_scripts"],
  ["tavernhelper", "regex_scripts"],
  ["tavernhelper", "scripts"],
  ["TavernHelper", "regex_scripts"],
  ["TavernHelper", "scripts"]
];

function isRecord(value: unknown): value is PresetRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Mirrors the legacy editor's signature-based preset payload recognition. */
export function isPresetPayloadObject(value: unknown): value is PresetRecord {
  if (!isRecord(value)) return false;

  if (PRESET_PAYLOAD_SIGNATURES.some(key => Object.prototype.hasOwnProperty.call(value, key))) {
    return true;
  }

  return NESTED_ARRAY_SIGNATURES.some(([ownerKey, arrayKey]) => {
    const owner = value[ownerKey];
    return isRecord(owner) && Array.isArray(owner[arrayKey]);
  });
}

/** Unwrap a recognized outer envelope without dropping unrelated wrapper fields. */
export function unwrapPresetObject(parsed: unknown): ParsedPresetImport {
  if (!isRecord(parsed)) {
    throw new Error("预设文件必须是 JSON 对象");
  }

  for (const key of PRESET_WRAPPER_KEYS) {
    const candidate = parsed[key];
    if (isPresetPayloadObject(candidate)) {
      return { data: candidate, envelope: { key, wrapper: parsed } };
    }
  }

  return { data: parsed, envelope: null };
}

/** Rebuild the original wrapper while replacing only its preset payload. */
export function buildPresetExportObject(
  payload: PresetRecord,
  envelope: PresetEnvelope | null
): PresetRecord {
  if (!envelope || !envelope.wrapper || !envelope.key) return payload;
  return Object.assign({}, envelope.wrapper, { [envelope.key]: payload });
}
