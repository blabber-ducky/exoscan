import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { WsLogLine } from '@/types'

const LEVEL_STYLE: Record<string, string> = {
  DEBUG: 'text-muted-foreground',
  INFO: 'text-foreground',
  WARN: 'text-yellow-400',
  ERROR: 'text-destructive',
}

function formatLog(line: WsLogLine): { prefix: string; text: string; style: string } | null {
  if (line.type === 'log') {
    const ts = line.timestamp ? new Date(line.timestamp).toLocaleTimeString() : ''
    const stage = line.stage ? `[${line.stage}]` : ''
    return {
      prefix: `${ts} ${stage}`.trim(),
      text: line.message ?? '',
      style: LEVEL_STYLE[line.level ?? 'INFO'] ?? 'text-foreground',
    }
  }
  if (line.type === 'complete') {
    return { prefix: '---', text: `Scan ${line.status ?? 'completed'}`, style: 'text-primary font-semibold' }
  }
  if (line.type === 'error') {
    return { prefix: '---', text: 'Scan failed', style: 'text-destructive font-semibold' }
  }
  return null
}

export function LogViewer({ logs }: { logs: WsLogLine[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="bg-black/60 border border-border rounded-lg p-4 font-mono text-xs h-80 overflow-y-auto">
      {logs.length === 0 && (
        <span className="text-muted-foreground">Waiting for scan output…</span>
      )}
      {logs.map((line, i) => {
        const fmt = formatLog(line)
        if (!fmt) return null
        return (
          <div key={i} className={cn('leading-5', fmt.style)}>
            {fmt.prefix && <span className="text-muted-foreground mr-2">{fmt.prefix}</span>}
            {fmt.text}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
