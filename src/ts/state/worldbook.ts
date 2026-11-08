/**
 * Type contracts for the legacy world-book editor state.
 *
 * These types describe the existing classic-script state; they do not create a
 * second runtime store or change the currently deployed application.
 */

export type EntryUid = string;

export interface WorldBookEntry extends Record<string, unknown> {
  uid?: EntryUid;
  comment?: string;
  content?: string;
  key?: string[];
  keysecondary?: string[];
  constant?: boolean;
  selective?: boolean;
  enabled?: boolean;
}

export interface WorldBookData extends Record<string, unknown> {
  entries: Record<EntryUid, WorldBookEntry>;
}

export interface WorldBookStateContract {
  currentPage: string;
  worldBookData: WorldBookData;
  activeUid: EntryUid | null;
  exportVersion: number;
  saveTimer: ReturnType<typeof setTimeout> | null;
  isDirty: boolean;
  selectMode: boolean;
  selectedUids: Set<EntryUid>;
  pendingImportData: unknown | null;
  isFullscreen: boolean;
  historyStack: string[];
  historyIndex: number;
}

export interface WorldBookStorageKeys {
  readonly storage: string;
  readonly version: string;
}

/** Undo/redo history contracts for the world-book editor. */
export type WorldBookSnapshot = string;

export interface HistoryStateContract {
  historyStack: WorldBookSnapshot[];
  historyIndex: number;
}

export interface HistoryLimits {
  readonly maxHistory: number;
}
