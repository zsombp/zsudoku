// localStorage wrapper. Replaces the artifact's `window.storage`, keeping the
// async signature so call sites do not care which one they are talking to.
//
// Settings and the single in-progress game live here because a synchronous read
// on boot means no flash of an empty board. The completed-game history goes to
// IndexedDB in Phase 5, where a few thousand records with move logs would blow
// past what localStorage can hold.
//
// Everything is best effort. Safari in private mode throws on write, and a
// failed save must never take the game down with it.

const NS = 'zsudoku'
export const KEYS = {
  game: `${NS}.game.v1`,
  settings: `${NS}.settings.v1`,
  records: `${NS}.records.v1`,
}

export async function get(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export async function remove(key) {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** Synchronous read, for the first paint only. */
export function getSync(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Asks the browser not to evict our data. A no-op in Safari, which does not
 * implement it. On iOS the real protection is being installed to the home
 * screen rather than browsed, so this is belt and braces for the Mac.
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* ignore */
  }
  return false
}
