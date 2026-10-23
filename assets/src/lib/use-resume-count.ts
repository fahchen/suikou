import { useEffect, useState } from "react"

/** Counts the times the tab comes back into view: focus, or the page turning
 * visible again. A moved branch (a commit on the source, a cherry-pick onto
 * the stack) emits no server event, so this is when a page re-reads what the
 * server cannot push. Focus and visibility often fire together; one return
 * counts once. */
export function useResumeCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let last = 0
    const resume = () => {
      if (document.visibilityState !== "visible") return
      const now = Date.now()
      if (now - last < 1000) return
      last = now
      setCount((n) => n + 1)
    }
    window.addEventListener("focus", resume)
    document.addEventListener("visibilitychange", resume)
    return () => {
      window.removeEventListener("focus", resume)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [])

  return count
}
