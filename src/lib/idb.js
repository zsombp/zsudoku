// A very small IndexedDB wrapper. No dependency, about sixty lines.
//
// This is where the completed-game history lives. localStorage keeps the
// settings and the one in-progress game, because a synchronous read on boot
// means no flash of an empty board. It cannot keep the history: a game record
// with a move log runs to roughly 16KB, and a few years of daily play would
// blow past the 5MB ceiling.
//
// Everything here is best effort. Safari in private mode refuses to open a
// database at all, and losing statistics must never take the game down.

const DB_NAME = 'zsudoku'
const DB_VERSION = 1
export const GAMES = 'games'

let dbPromise = null

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(GAMES)) {
        const store = db.createObjectStore(GAMES, { keyPath: 'id' })
        store.createIndex('endedAt', 'endedAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch(err => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

function tx(store, mode, fn) {
  return open().then(
    db =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        t.oncomplete = () => resolve(req?.result)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
  )
}

export const put = record => tx(GAMES, 'readwrite', s => s.put(record)).catch(() => false)
export const getAll = () => tx(GAMES, 'readonly', s => s.getAll()).catch(() => [])
export const del = id => tx(GAMES, 'readwrite', s => s.delete(id)).catch(() => false)
export const clear = () => tx(GAMES, 'readwrite', s => s.clear()).catch(() => false)
export const count = () => tx(GAMES, 'readonly', s => s.count()).catch(() => 0)

export async function putMany(records) {
  for (const r of records) await put(r)
  return true
}

/** Rough bytes used by the history, for the settings screen. */
export async function estimateBytes() {
  try {
    const games = await getAll()
    return JSON.stringify(games).length
  } catch {
    return 0
  }
}
