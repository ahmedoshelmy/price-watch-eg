import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import type { PriceDroppedEvent } from './api'

export interface Toast {
  id: string
  event: PriceDroppedEvent
}

/** Subscribes to live price drops on the `/prices` socket.io namespace; toasts dismiss themselves after 12 s. */
export function useDropAlerts(onDrop: () => void): {
  toasts: Toast[]
  dismiss: (id: string) => void
  connected: boolean
} {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io('/prices', { transports: ['websocket'] })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('price-dropped', (event: PriceDroppedEvent) => {
      setToasts((current) =>
        [{ id: event.alertKey, event }, ...current.filter((t) => t.id !== event.alertKey)].slice(0, 4),
      )
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== event.alertKey)), 12_000)
      onDrop()
    })
    return () => {
      socket.close()
    }
  }, [onDrop])

  return { toasts, connected, dismiss: (id) => setToasts((current) => current.filter((t) => t.id !== id)) }
}
