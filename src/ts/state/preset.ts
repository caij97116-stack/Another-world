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
