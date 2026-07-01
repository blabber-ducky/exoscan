import { useEffect, useRef } from 'react'
import { createScanLogSocket } from '@/api/ws'
import { useAuthStore } from '@/store/authStore'
import { useScanStore } from '@/store/scanStore'

export function useScanLogs(scanId: string | undefined) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const { appendLog, setWsStatus, setTerminalStatus, reset } = useScanStore()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!scanId || !accessToken) return

    reset()
    setWsStatus('connecting')

    const ws = createScanLogSocket(
      scanId,
      accessToken,
      (line) => {
        appendLog(line)
        if (line.type === 'complete') {
          setTerminalStatus(line.status ?? 'completed')
          setWsStatus('closed')
        }
        if (line.type === 'error') {
          setTerminalStatus('failed')
          setWsStatus('closed')
        }
      },
      () => setWsStatus('closed'),
    )

    ws.onopen = () => setWsStatus('connected')
    wsRef.current = ws

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [scanId, accessToken])

  return useScanStore()
}
