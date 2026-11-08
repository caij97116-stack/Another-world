/**
 * Undo/redo history contracts for the world-book editor.
 *
 * The legacy implementation stores JSON snapshots rather than live objects.
 * Keeping the snapshot type as string documents that behavior precisely.
 */

export type WorldBookSnapshot = string;

export interface HistoryStateContract {
  historyStack: WorldBookSnapshot[];
  historyIndex: number;
}

export interface HistoryLimits {
  readonly maxHistory: number;
}
