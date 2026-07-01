import type { WsLogLine } from '@/types'

export function createScanLogSocket(
  scanId: string,
  token: string,
  onMessage: (line: WsLogLine) => void,
  onClose: () => void,
): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${window.location.host}/api/v1/scans/${scanId}/logs?token=${encodeURIComponent(token)}`
  const ws = new WebSocket(url)

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as WsLogLine
      if (data.type !== 'ping') onMessage(data)
    } catch {}
  }

  ws.onclose = onClose
  ws.onerror = onClose

  return ws
}
