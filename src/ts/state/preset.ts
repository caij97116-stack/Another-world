/**
 * Type contracts for the legacy preset editor state.
 *
 * Preset payloads intentionally remain open records so unknown Tavern fields
 * can be preserved during import, editing, and export.
 */

export type PresetRecord = Record<string, unknown>;
export type PresetArrayPath = string[];

export interface PresetStateContract {
  presetData: PresetRecord | null;
  presetVersion: number;
  presetSaveTimer: ReturnType<typeof setTimeout> | null;
  presetDirty: boolean;
  presetEnvelope: PresetRecord | null;
  presetArrayPaths: Record<string, PresetArrayPath>;
}

export interface PresetStorageKeys {
  readonly storage: string;
  readonly version: string;
  readonly envelope: string;
  readonly arrayPaths: string;
}
