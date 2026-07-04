import { useCallback, useRef } from 'react'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Traps Tab focus inside a modal, closes it on Escape, and restores focus to
// whatever was focused before the modal opened. Implemented as a callback ref
// (not useEffect) because these modals mount/unmount conditionally inside an
// always-mounted parent — an effect keyed on `onEscape` would only run once,
// before the modal's DOM node exists, and would never attach the listener.
export function useFocusTrap<T extends HTMLElement>(onEscape?: () => void) {
  const cleanupRef = useRef<() => void>(undefined)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  return useCallback((node: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = undefined
    if (!node) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => !el.hasAttribute('disabled'))

    focusables()[0]?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onEscapeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', handleKeyDown)
    cleanupRef.current = () => {
      node.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [])
}
