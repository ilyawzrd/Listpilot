/** What maps-lists is doing now; null when it isn't running. */
export type Phase = 'start' | 'research' | 'import' | 'review' | 'lookup' | 'chrome' | 'save' | 'lists' | null
/** The executor's artifacts/progress.json while it saves. */
export type Progress = { step: string; list: string; done: number; total: number; current: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'maps-lists': {
      phase: Phase
      /** When the phase began (ms), so an older progress file is ignored. */
      since: number
      frame: number
      progress: Progress | null
      /** Web searches, page reads and research agents during research. */
      searches: number
      agents: number
    }
  }
}
