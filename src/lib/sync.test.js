import { describe, it, expect, beforeEach } from 'vitest'
import { sync, DEFAULT_CFG, addTombstone, loadTombstones } from './backup.js'

// Two devices, one repository, and a fake GitHub in between.
//
// The unit tests cover the merge. This covers the thing that actually goes
// wrong with sync: a game played on one device reaching the other, a deletion
// travelling rather than bouncing back, and a device that has never seen a
// month still getting it.

/** A repository that behaves the way the contents API does, including shas. */
function fakeRepo() {
  const files = new Map()
  let n = 0
  return {
    files,
    fetch: async (url, opts = {}) => {
      const path = String(url).replace('https://api.github.com', '')
      const json = body => ({ ok: true, status: 200, json: async () => body })
      const missing = () => ({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) })

      if (path.startsWith('/repos/o/r/contents/games?')) {
        if (!files.size) return missing()
        return json([...files.keys()].map(name => ({ type: 'file', name: name.split('/').pop() })))
      }

      const m = path.match(/\/repos\/o\/r\/contents\/(games%2F[^?]+|games\/[^?]+)/)
      if (!m) return missing()
      const name = decodeURIComponent(m[1])

      if (opts.method === 'PUT') {
        const body = JSON.parse(opts.body)
        const sha = `sha${++n}`
        files.set(name, { sha, content: body.content })
        return { ok: true, status: 200, json: async () => ({ content: { sha } }) }
      }
      const f = files.get(name)
      if (!f) return missing()
      return json({ sha: f.sha, content: f.content })
    },
    read(name) {
      const f = files.get(name)
      return f ? JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')) : null
    },
  }
}

/** One device: its own games, its own config, its own tombstone store. */
function device(games = []) {
  const store = new Map()
  return {
    games,
    cfg: { ...DEFAULT_CFG, enabled: true, owner: 'o', repo: 'r', branch: 'main' },
    store,
    async sync(opts = {}) {
      globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: k => store.delete(k),
      }
      const res = await sync(this.games, { cfg: this.cfg, token: 't', ...opts })
      if (res.cfg) this.cfg = res.cfg
      // What the app does with the result, so the fixture stays honest.
      const dropped = new Set(res.removeLocally || [])
      this.games = [...this.games.filter(g => !dropped.has(g.id)), ...(res.incoming || [])]
      return res
    },
    delete(id) {
      globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: k => store.delete(k),
      }
      const g = this.games.find(x => x.id === id)
      addTombstone(id, g.endedAt)
      this.games = this.games.filter(x => x.id !== id)
    },
  }
}

const july = (d, h = 12) => new Date(2026, 6, d, h).getTime()
const game = (id, endedAt) => ({ id, endedAt, completed: true, graded: 'Hard', mistakes: 0 })

describe('two devices, one repository', () => {
  let repo
  beforeEach(() => {
    repo = fakeRepo()
    globalThis.fetch = repo.fetch
  })

  it('carries a game from one device to the other', async () => {
    const phone = device([game('phone-1', july(1))])
    const mac = device([game('mac-1', july(2))])

    await phone.sync({ full: true })
    const res = await mac.sync({ full: true })

    expect(res.pulled ?? res.incoming.length).toBe(1)
    expect(mac.games.map(g => g.id).sort()).toEqual(['mac-1', 'phone-1'])

    // And the phone gets the Mac's game on its next pass.
    await phone.sync({ full: true })
    expect(phone.games.map(g => g.id).sort()).toEqual(['mac-1', 'phone-1'])
  })

  it('gives a device a month it has never seen', async () => {
    // The difference between backup and sync: the Mac has nothing in August, so
    // without listing the repository it would never look.
    const phone = device([game('aug-1', new Date(2026, 7, 3, 12).getTime())])
    const mac = device([game('jul-1', july(1))])

    await phone.sync({ full: true })
    await mac.sync({ full: true })

    expect(mac.games.map(g => g.id).sort()).toEqual(['aug-1', 'jul-1'])
  })

  it('lets a deletion travel instead of bouncing back', async () => {
    const phone = device([game('a', july(1)), game('junk', july(2))])
    const mac = device([])

    await phone.sync({ full: true })
    await mac.sync({ full: true })
    expect(mac.games).toHaveLength(2)

    // The Mac deletes the junk game and syncs.
    mac.delete('junk')
    await mac.sync({ full: true })

    // The phone must lose it too, rather than pushing it back up.
    await phone.sync({ full: true })
    expect(phone.games.map(g => g.id)).toEqual(['a'])

    // And it stays gone through another full round trip on both.
    await mac.sync({ full: true })
    await phone.sync({ full: true })
    expect(mac.games.map(g => g.id)).toEqual(['a'])
    expect(phone.games.map(g => g.id)).toEqual(['a'])
  })

  it('records the deletion in the month it belongs to and nowhere else', async () => {
    const phone = device([game('jul', july(1)), game('aug', new Date(2026, 7, 5, 12).getTime())])
    await phone.sync({ full: true })
    phone.delete('jul')
    await phone.sync({ full: true })

    expect(repo.read('games/2026-07.json').deleted.map(t => t.id)).toEqual(['jul'])
    expect(repo.read('games/2026-08.json').deleted).toEqual([])
  })

  it('stops carrying a tombstone once the repository has it', async () => {
    const phone = device([game('a', july(1)), game('b', july(2))])
    await phone.sync({ full: true })
    phone.delete('b')
    expect(loadTombstones()).toHaveLength(1)

    await phone.sync({ full: true })
    // Published, so this device need not keep repeating it.
    expect(loadTombstones()).toEqual([])
    // But the repository still says so, which is what stops the Mac reviving it.
    expect(repo.read('games/2026-07.json').deleted.map(t => t.id)).toEqual(['b'])
  })

  it('writes nothing when both ends already agree', async () => {
    const phone = device([game('a', july(1))])
    await phone.sync({ full: true })
    const before = repo.files.get('games/2026-07.json').sha

    await phone.sync({ full: true })
    expect(repo.files.get('games/2026-07.json').sha).toBe(before)
  })

  it('survives a repository that has never been written to', async () => {
    const mac = device([])
    const res = await mac.sync({ full: true })
    expect(res.ok).toBe(true)
    expect(mac.games).toEqual([])
  })
})
