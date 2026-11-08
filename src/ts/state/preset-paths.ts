import type { PresetArrayPath, PresetRecord } from "./preset";

export interface PresetArrayLocation {
  owner: PresetRecord;
  key: string;
  value: unknown[];
}

/** Validate the exact path shape accepted by the legacy localStorage restore. */
export function isPresetArrayPath(value: unknown): value is PresetArrayPath {
  return Array.isArray(value)
    && value.length > 0
    && value.every((part): part is string => typeof part === "string" && part.length > 0);
}

/**
 * Resolve a nested array without changing or flattening the imported preset.
 * Returns null when any intermediate object or final array is missing.
 */
export function findPresetArrayAtPath(
  root: PresetRecord | null,
  path: PresetArrayPath
): PresetArrayLocation | null {
  if (!root || !isPresetArrayPath(path)) return null;

  let current: unknown = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!isRecord(current)) return null;
    current = current[path[index]];
  }

  if (!isRecord(current)) return null;
  const key = path[path.length - 1];
  const value = current[key];
  return Array.isArray(value) ? { owner: current, key, value } : null;
}

function isRecord(value: unknown): value is PresetRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
