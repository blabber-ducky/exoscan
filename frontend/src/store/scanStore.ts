import { create } from 'zustand'
import type { WsLogLine } from '@/types'

interface ScanStore {
  logs: WsLogLine[]
  wsStatus: 'connecting' | 'connected' | 'closed'
  terminalStatus: string | null   // "completed" | "failed" | etc from WS complete event
  appendLog: (line: WsLogLine) => void
  setWsStatus: (s: ScanStore['wsStatus']) => void
  setTerminalStatus: (s: string) => void
  reset: () => void
}

export const useScanStore = create<ScanStore>((set) => ({
  logs: [],
  wsStatus: 'connecting',
  terminalStatus: null,
  appendLog: (line) => set((s) => ({ logs: [...s.logs, line] })),
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setTerminalStatus: (terminalStatus) => set({ terminalStatus }),
  reset: () => set({ logs: [], wsStatus: 'connecting', terminalStatus: null }),
}))
