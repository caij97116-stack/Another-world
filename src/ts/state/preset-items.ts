import type { PresetArrayPath, PresetArrayPathMap, PresetRecord } from "./preset";

export type PresetBooleanParser = (value: unknown, fallback: boolean) => boolean;
export interface PresetArrayLocation {
  owner: PresetRecord;
  key: string;
  value: unknown[];
}

const REGEX_ARRAY_PATHS: PresetArrayPath[] = [
  ["regex_scripts"], ["regexScripts"], ["regex"], ["regexes"],
  ["extensions", "regex_scripts"], ["extensions", "regexScripts"],
  ["tavernhelper", "regex_scripts"], ["TavernHelper", "regex_scripts"]
];

const SCRIPT_ARRAY_PATHS: PresetArrayPath[] = [
  ["scripts"], ["tavern_helper_scripts"], ["tavernhelper_scripts"], ["tavernHelperScripts"],
  ["extensions", "scripts"], ["extensions", "tavern_helper_scripts"],
  ["tavernhelper", "scripts"], ["TavernHelper", "scripts"], ["mjs_scripts"]
];

/** Validate a non-empty nested property path used by preset array aliases. */
export function isPresetArrayPath(value: unknown): value is PresetArrayPath {
  return Array.isArray(value)
    && value.length > 0
    && value.every((part): part is string => typeof part === "string" && part.length > 0);
}

function isRecord(value: unknown): value is PresetRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Resolve an existing array at its original nested path. */
export function getPresetArrayAtPath(
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

/** Backward-compatible descriptive alias for resolving an existing path. */
export function findPresetArrayAtPath(
  root: PresetRecord | null,
  path: PresetArrayPath
): PresetArrayLocation | null {
  return getPresetArrayAtPath(root, path);
}

/**
 * Select the original alias path, preferring populated arrays and preserving
 * candidate order when multiple arrays have the same occupancy.
 */
export function ensurePresetArrayAlias(
  root: PresetRecord | null,
  pathMap: PresetArrayPathMap,
  alias: string,
  candidates: PresetArrayPath[]
): unknown[] {
  if (!root) return [];

  const savedPath = pathMap[alias];
  if (Array.isArray(savedPath)) {
    const saved = getPresetArrayAtPath(root, savedPath);
    if (saved) return saved.value;
  }

  const found = candidates
    .map(path => ({ path, location: getPresetArrayAtPath(root, path) }))
    .filter((item): item is { path: PresetArrayPath; location: PresetArrayLocation } => item.location !== null);

  const selected = found.find(item => item.location.value.length > 0) || found[0];
  if (selected) {
    pathMap[alias] = selected.path.slice();
    return selected.location.value;
  }

  root[alias] = [];
  pathMap[alias] = [alias];
  return root[alias] as unknown[];
}

export function getActivePresetArray(
  root: PresetRecord | null,
  pathMap: PresetArrayPathMap,
  alias: "regex_scripts" | "scripts"
): unknown[] {
  return ensurePresetArrayAlias(
    root,
    pathMap,
    alias,
    alias === "regex_scripts" ? REGEX_ARRAY_PATHS : SCRIPT_ARRAY_PATHS
  );
}

export function setActivePresetArray(
  root: PresetRecord,
  pathMap: PresetArrayPathMap,
  alias: "regex_scripts" | "scripts",
  value: unknown[]
): unknown[] {
  getActivePresetArray(root, pathMap, alias);
  const target = getPresetArrayAtPath(root, pathMap[alias]);
  if (target) target.owner[target.key] = value;
  else root[alias] = value;
  return value;
}

/**
 * Create a canonical view property while retaining the source field names.
 * If only legacy aliases exist, the canonical accessor stays non-enumerable
 * so JSON serialization does not add duplicate keys.
 */
export function definePresetViewField(
  view: PresetRecord,
  canonical: string,
  aliases: string[],
  fallback: unknown,
  readTransform?: (value: unknown) => unknown
): void {
  const keys = [canonical, ...aliases];
  const present = keys.filter(key => Object.prototype.hasOwnProperty.call(view, key));
  const storageKey = present.find(key => view[key] !== undefined && view[key] !== null && view[key] !== "")
    || present[0]
    || null;
  const canonicalPresent = Object.prototype.hasOwnProperty.call(view, canonical);
  let current = storageKey ? view[storageKey] : fallback;
  if (readTransform) current = readTransform(current);

  const descriptor = canonicalPresent ? Object.getOwnPropertyDescriptor(view, canonical) : null;
  Object.defineProperty(view, canonical, {
    configurable: true,
    enumerable: canonicalPresent ? !!(descriptor && descriptor.enumerable) : false,
    get() { return current; },
    set(value: unknown) {
      current = value;
      if (present.length) {
        present.forEach(key => {
          if (key !== canonical) view[key] = value;
        });
      } else {
        Object.defineProperty(view, canonical, {
          value,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
    }
  });
}

function asRecord(raw: unknown): PresetRecord {
  return isRecord(raw) ? { ...raw } : {};
}

export function normalizeRegexScript(
  raw: unknown,
  index: number,
  parseBoolean: PresetBooleanParser
): PresetRecord {
  const view = asRecord(raw);
  definePresetViewField(view, "id", [], `regex_${Date.now()}_${index}`);
  definePresetViewField(view, "scriptName", ["name"], `正则 ${index + 1}`);
  definePresetViewField(view, "findRegex", ["find", "pattern"], "");
  definePresetViewField(view, "replaceString", ["replace", "replacement"], "");
  definePresetViewField(view, "trimStrings", [], [], value => Array.isArray(value) ? value : []);
  definePresetViewField(view, "placement", [], [1, 2], value => Array.isArray(value) ? value : value != null ? [value] : [1, 2]);
  definePresetViewField(view, "disabled", [], false, value => parseBoolean(value, false));
  definePresetViewField(view, "markdownOnly", [], false, value => parseBoolean(value, false));
  definePresetViewField(view, "promptOnly", [], false, value => parseBoolean(value, false));
  definePresetViewField(view, "runOnEdit", [], true, value => value === undefined ? true : parseBoolean(value, true));
  definePresetViewField(view, "substituteRegex", [], 0, value => value === undefined ? 0 : Number(value));
  definePresetViewField(view, "minDepth", [], null);
  definePresetViewField(view, "maxDepth", [], null);
  return view;
}

export function normalizeScript(
  raw: unknown,
  index: number,
  parseBoolean: PresetBooleanParser
): PresetRecord {
  const view = asRecord(raw);
  definePresetViewField(view, "id", [], `script_${Date.now()}_${index}`);
  definePresetViewField(view, "name", ["scriptName", "title"], `脚本 ${index + 1}`);
  definePresetViewField(view, "code", ["content", "script", "js", "value"], "", value => typeof value === "string" ? value : String(value || ""));
  definePresetViewField(view, "disabled", [], false, value => parseBoolean(value, false));
  definePresetViewField(view, "type", ["kind"], "js");
  definePresetViewField(view, "trigger", ["event"], "");
  return view;
}

/** Preserve unrecognized source keys when producing the script editor view. */
export function normalizeScripts(
  items: unknown[],
  parseBoolean: PresetBooleanParser
): PresetRecord[] {
  return items.map((item, index) => {
    const normalized = normalizeScript(item, index, parseBoolean);
    const known = new Set([
      "id", "name", "scriptName", "title", "code", "content", "script", "js", "value",
      "disabled", "type", "kind", "trigger", "event"
    ]);
    if (isRecord(item)) {
      Object.keys(item).forEach(key => {
        if (!known.has(key) && normalized[key] === undefined) normalized[key] = item[key];
      });
    }
    return normalized;
  });
}
