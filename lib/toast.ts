export type ToastKind = 'success' | 'error'
export type Toast = { id: number; message: string; kind: ToastKind }

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
let listeners: Listener[] = []
let nextId = 1

function emit() {
  listeners.forEach(l => l(toasts))
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener)
  return () => { listeners = listeners.filter(l => l !== listener) }
}

export function showToast(message: string, kind: ToastKind = 'success') {
  const id = nextId++
  toasts = [...toasts, { id, message, kind }]
  emit()
  setTimeout(() => dismissToast(id), 4000)
}

export function dismissToast(id: number) {
  toasts = toasts.filter(t => t.id !== id)
  emit()
}
