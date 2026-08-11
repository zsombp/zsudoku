// Backup to a GitHub repository you own.
//
// This is the one place the app talks to a network, and it is the exception to
// the zero-third-party-requests rule rather than a loosening of it. It is off
// until you turn it on, it only ever talks to api.github.com, and with it off
// nothing here runs at all. Airplane mode is unaffected either way.
//
// Why GitHub and not a file you save yourself: an export you have to remember
// is an export that happens once. Browser storage gets evicted, Safari's
// storage.persist() is a no-op, and the only real protection today is having
// the app installed to the home screen. A few hundred games deserve better.
//
// ---- shape, and why ----
//
// Games are sharded by the month they ended in, `games/YYYY-MM.json`. One file
// would be simpler, but a game record runs about 7KB with its move log, so a
// few hundred games would push a single file past what the contents API hands
// back in one read. Shards also mean a push after an evening's play sends one
// small file rather than the entire history.
//
// The merge is a union by game id, which is safe because ids are already unique
// per game (`endedAt-seed`). `mergeShard` reports both directions: what to push,
// and what the remote holds that this device does not, which is what sync
// applies locally.
//
// ---- why deletes need tombstones ----
//
// A union merge has no way to express "this game is gone". Delete a game on the
// Mac and the next sync pulls it back from the phone, which pulls it back from
// the Mac, forever. So a shard also carries a list of deleted ids, and both ends
// honour it. Without this, deleting anything is futile the moment a second
// device exists.
//
// Tombstones are kept for a year and then dropped. By then every device has
// long since seen them, and a tombstone outliving the memory of the game is
// just a growing file.

const API = 'https://api.github.com'

/** Config, and the token, in separate keys on purpose. */
const CFG_KEY = 'zsudoku.backup.v1'
const TOKEN_KEY = 'zsudoku.ghtoken.v1'

export const DEFAULT_CFG = {
  enabled: false,
  owner: '',
  repo: '',
  branch: 'main',
  lastPushAt: null,
  lastError: null,
  // When every shard was last checked against the remote rather than assumed
  // unchanged. See `backup`.
  lastCheckAt: null,
  // Per-shard bookkeeping: the file sha GitHub last gave us, and a fingerprint
  // of what we pushed, so an unchanged shard is not pushed again.
  shards: {},
}

export const loadCfg = () => {
  try {
    return { ...DEFAULT_CFG, ...(JSON.parse(localStorage.getItem(CFG_KEY)) || {}) }
  } catch {
    return { ...DEFAULT_CFG }
  }
}

export const saveCfg = cfg => {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
  } catch {
    /* best effort, like every other write in this app */
  }
}

/**
 * The token lives in its own key and is never merged into settings.
 *
 * Settings get exported, pasted into bug reports and read out of localStorage
 * by anything that knows the key. A write token has no business travelling with
 * them, so it does not share their container.
 */
export const loadToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export const saveToken = token => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nothing to do */
  }
}

// ---- plumbing ----

/** The month a game belongs to, which is the shard it lives in. */
export const shardFor = game => {
  const d = new Date(game.endedAt || 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const pathFor = shard => `games/${shard}.json`

/** Old enough that every device has certainly seen it. */
const TOMBSTONE_TTL = 365 * 24 * 60 * 60 * 1000

const TOMBSTONE_KEY = 'zsudoku.deleted.v1'

/**
 * Ids deleted on this device and not yet published.
 *
 * Kept in localStorage rather than IndexedDB because it has to survive the
 * record being gone, and because the sync path already reads config from here.
 */
export const loadTombstones = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(TOMBSTONE_KEY)) || []
    return Array.isArray(raw) ? raw.filter(t => t?.id) : []
  } catch {
    return []
  }
}

/**
 * Records that a game was deleted here, and which month's file has to say so.
 *
 * The shard is stored rather than derived, so a tombstone lands in the one file
 * that describes the game it refers to instead of being copied into every month
 * in the repository.
 */
export const addTombstone = (id, endedAt) => {
  if (!id) return
  try {
    const all = loadTombstones().filter(t => t.id !== id)
    all.push({ id, at: Date.now(), shard: shardFor({ endedAt }) })
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(all))
  } catch {
    /* best effort */
  }
}

const saveTombstones = list => {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(list))
  } catch {
    /* best effort */
  }
}

/** btoa only speaks Latin-1, and a puzzle is not guaranteed to be ASCII. */
const toBase64 = str => {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

const fromBase64 = b64 => {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** FNV-1a. Only has to notice that a shard changed, not resist an attacker. */
const fingerprint = ids => {
  let h = 0x811c9dc5
  for (const s of [...ids].sort()) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  return (h >>> 0).toString(16)
}

/** Turns GitHub's status codes into something worth showing a person. */
const describe = (status, body) => {
  if (status === 401) return 'GitHub rejected the token. It may have expired or been revoked.'
  if (status === 403) return 'GitHub refused the request. Check the token has Contents write access to this repository.'
  if (status === 404) return 'Repository or branch not found, or the token cannot see it. Check the owner and name, and that the token grants access to this repository.'
  if (status === 409) return 'The file changed on GitHub while this push was in flight.'
  if (status === 422) return `GitHub could not accept the file. ${body?.message || ''}`.trim()
  return `GitHub returned ${status}. ${body?.message || ''}`.trim()
}

async function call(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

/**
 * Does this token actually work on this repository, and is it private.
 *
 * Called by the settings screen so turning backup on can say something true
 * rather than "saved". A public data repository is worth warning about: game
 * history is not secret, but it is not something to publish by accident.
 */
export async function verify({ token, owner, repo }) {
  if (!token || !owner || !repo) return { ok: false, error: 'Token, owner and repository are all needed.' }
  try {
    const { ok, status, body } = await call(token, `/repos/${owner}/${repo}`)
    if (!ok) return { ok: false, error: describe(status, body) }
    if (!body.permissions?.push) {
      return { ok: false, error: 'That token can read the repository but not write to it. It needs Contents: read and write.' }
    }
    return { ok: true, private: Boolean(body.private), branch: body.default_branch }
  } catch {
    return { ok: false, error: 'Could not reach GitHub. Check the connection and try again.' }
  }
}

async function readShard(token, { owner, repo, branch }, shard) {
  const { ok, status, body } = await call(
    token,
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(pathFor(shard))}?ref=${encodeURIComponent(branch)}`
  )
  // A shard that does not exist yet is the normal case for a new month.
  if (status === 404) return { games: [], deleted: [], sha: null }
  if (!ok) throw new Error(describe(status, body))
  try {
    const parsed = JSON.parse(fromBase64(body.content || ''))
    return {
      games: Array.isArray(parsed?.games) ? parsed.games : [],
      // Shards written before tombstones existed simply have none.
      deleted: Array.isArray(parsed?.deleted) ? parsed.deleted : [],
      sha: body.sha,
    }
  } catch {
    // Something is in the file that is not ours. Refuse rather than overwrite.
    throw new Error(`${pathFor(shard)} on GitHub is not a Zsudoku shard. Refusing to overwrite it.`)
  }
}

/**
 * Union by game id.
 *
 * `remoteOnly` is what two-way sync would write back into IndexedDB. Backup
 * ignores it; computing it here anyway is what keeps that door open.
 */
export function mergeShard(remote, local, { remoteDeleted = [], localDeleted = [], now = 0 } = {}) {
  // Both ends' tombstones, deduplicated, with anything ancient dropped.
  const stones = new Map()
  for (const t of [...remoteDeleted, ...localDeleted]) {
    if (!t?.id) continue
    const at = t.at || 0
    if (now && at && now - at > TOMBSTONE_TTL) continue
    if (!stones.has(t.id) || at > stones.get(t.id).at) stones.set(t.id, { id: t.id, at })
  }

  const byId = new Map()
  for (const g of remote) if (g?.id && !stones.has(g.id)) byId.set(g.id, g)

  const added = []
  for (const g of local) {
    if (!g?.id || stones.has(g.id)) continue
    if (!byId.has(g.id)) added.push(g)
    // Local wins on a genuine collision: the device that played the game holds
    // the better copy, and ids embed the end time so a real clash is unlikely.
    byId.set(g.id, g)
  }

  const localIds = new Set(local.map(g => g?.id))
  // What this device is missing: on the remote, not here, and not deleted.
  const remoteOnly = remote.filter(g => g?.id && !localIds.has(g.id) && !stones.has(g.id))
  // What this device must drop: here, but deleted somewhere else.
  const removeLocally = local.filter(g => g?.id && stones.has(g.id)).map(g => g.id)

  const merged = [...byId.values()].sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0))
  return { merged, added, remoteOnly, removeLocally, deleted: [...stones.values()] }
}

async function writeShard(token, { owner, repo, branch }, shard, games, sha, deleted = []) {
  const content = JSON.stringify(
    { app: 'zsudoku', schema: 1, shard, updatedAt: new Date().toISOString(), games, deleted },
    null,
    1
  )
  const path = `/repos/${owner}/${repo}/contents/${encodeURIComponent(pathFor(shard))}`
  const send = withBranch =>
    call(token, path, {
      method: 'PUT',
      body: JSON.stringify({
        message: `zsudoku: ${games.length} game${games.length === 1 ? '' : 's'} through ${shard}`,
        content: toBase64(content),
        ...(withBranch ? { branch } : {}),
        ...(sha ? { sha } : {}),
      }),
    })

  let res = await send(true)
  // A repository with no commits has no branches either, so naming one that
  // does not exist yet comes back 404 and reads as "repo not found". Retrying
  // without it lets GitHub create the default branch with this first file.
  if (!res.ok && res.status === 404 && !sha) res = await send(false)

  if (!res.ok) throw new Error(describe(res.status, res.body))
  return res.body.content?.sha || null
}

/**
 * Push every shard whose contents have changed since the last push.
 *
 * Returns what happened rather than throwing, because a failed backup must
 * never be something the game notices. The caller stores the updated config and
 * shows the error somewhere calm.
 */
/** How long the fingerprint cache is trusted before every shard is re-checked. */
const RECHECK_MS = 24 * 60 * 60 * 1000

/** Which months exist in the repository, so sync can pull a device's own gaps. */
async function listShards(token, { owner, repo, branch }) {
  const { ok, status, body } = await call(
    token,
    `/repos/${owner}/${repo}/contents/games?ref=${encodeURIComponent(branch)}`
  )
  // No games directory yet is the normal state of a fresh repository.
  if (status === 404) return []
  if (!ok) throw new Error(describe(status, body))
  return (Array.isArray(body) ? body : [])
    .filter(f => f.type === 'file' && /^\d{4}-\d{2}\.json$/.test(f.name))
    .map(f => f.name.replace(/\.json$/, ''))
}

/**
 * Reconcile this device with the repository.
 *
 * `full` decides how much of history is considered. After a game only the
 * months this device holds are touched, which is normally one small file. A
 * full pass lists the repository first, so a device that has never seen a month
 * still pulls it: that is the difference between backup and sync, and it is why
 * a Mac that has never opened August still ends up with the phone's August.
 *
 * Returns what the caller must apply locally rather than touching IndexedDB
 * itself, because this file has no business knowing where games are kept.
 */
export async function sync(games, { cfg = loadCfg(), token = loadToken(), force = false, full = false } = {}) {
  if (!token || !cfg.owner || !cfg.repo) {
    return { ok: false, error: 'Backup is not configured.', cfg }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // Not an error worth reporting: it will go out next time.
    return { ok: false, offline: true, cfg }
  }

  const next = { ...cfg, shards: { ...cfg.shards } }
  const now = Date.now()
  const tombstones = loadTombstones()

  const buckets = new Map()
  for (const g of games) {
    if (!g?.id) continue
    const shard = shardFor(g)
    if (!buckets.has(shard)) buckets.set(shard, [])
    buckets.get(shard).push(g)
  }

  let shards = [...buckets.keys()]
  if (full) {
    try {
      for (const name of await listShards(token, next)) {
        if (!buckets.has(name)) buckets.set(name, [])
      }
      shards = [...buckets.keys()]
    } catch (err) {
      next.lastError = String(err.message || err)
      return { ok: false, error: next.lastError, cfg: next }
    }
  }
  shards.sort()

  // The fingerprint cache says "this month has not changed here since the last
  // push", which is only half the question: it assumes the remote has not
  // changed either. Delete a file on GitHub, or play on another device, and
  // every future push skips that month, leaving a backup that believes it is
  // complete and is not.
  const stale = now - (cfg.lastCheckAt || 0) > RECHECK_MS
  const trustCache = !force && !full && !stale

  const incoming = []
  const removeLocally = []
  // Months whose file now carries this device's deletions.
  const published = new Set()
  let pushed = 0
  let sent = 0

  for (const shard of shards) {
    const local = buckets.get(shard) || []
    // Only this month's deletions belong in this month's file.
    const mine = tombstones.filter(t => t.shard === shard)
    const mark = fingerprint(local.map(g => g.id))
    const known = next.shards[shard]
    // Nothing new in this month here, and nothing suggesting the other end moved.
    if (trustCache && known?.fingerprint === mark && !mine.length) continue

    try {
      const remote = await readShard(token, next, shard)
      const merged = mergeShard(remote.games, local, {
        remoteDeleted: remote.deleted,
        localDeleted: mine,
        now,
      })
      incoming.push(...merged.remoteOnly)
      removeLocally.push(...merged.removeLocally)

      // Write only when the file would actually differ, so a quiet sync costs
      // reads and no commits.
      const unchanged =
        remote.sha &&
        merged.merged.length === remote.games.length &&
        merged.deleted.length === remote.deleted.length
      if (!force && unchanged && !merged.added.length) {
        next.shards[shard] = { sha: remote.sha, fingerprint: mark }
        continue
      }

      const sha = await writeShard(token, next, shard, merged.merged, remote.sha, merged.deleted)
      next.shards[shard] = { sha, fingerprint: mark }
      published.add(shard)
      pushed++
      sent += merged.added.length
    } catch (err) {
      next.lastError = String(err.message || err)
      return { ok: false, error: next.lastError, cfg: next, pushed, sent, incoming, removeLocally }
    }
  }

  // A tombstone can be forgotten here once the file that has to carry it says
  // so, and once it is old enough that every device has certainly read it.
  if (tombstones.length) {
    saveTombstones(
      tombstones.filter(t => !published.has(t.shard) && now - (t.at || 0) < TOMBSTONE_TTL)
    )
  }

  next.lastPushAt = now
  if (force || full || stale) next.lastCheckAt = now
  next.lastError = null
  return { ok: true, cfg: next, pushed, sent, incoming, removeLocally }
}

/** The cheap path, after a game. Pushes, and picks up anything new this month. */
export const backup = (games, opts = {}) => sync(games, opts)

// ---- the game you are in the middle of ----
//
// Finished games merge by union, which is safe because they never change. A
// position in progress is the opposite: it is one thing that both devices
// rewrite, so a union is meaningless and last-write-wins would silently throw
// away moves.
//
// The rule here is that the longer move log wins, and a tie goes to the more
// recently touched. That is not a general conflict resolution scheme, it is the
// one fact that matters: a position with more moves in it contains the one with
// fewer, because both started from the same puzzle. Anything genuinely
// divergent is reported rather than merged, and the player chooses.

const LIVE_PATH = 'live/game.json'

/** Which of two saves is further along, and whether they diverged. */
export function compareSaves(mine, theirs) {
  if (!theirs?.puzzle) return { take: 'mine', reason: 'nothing there' }
  if (!mine?.puzzle) return { take: 'theirs', reason: 'nothing here' }

  // Different puzzles entirely: not a conflict to merge, a choice to offer.
  if (mine.seed !== theirs.seed || (mine.variant || 'classic') !== (theirs.variant || 'classic')) {
    return { take: 'ask', reason: 'different puzzles' }
  }

  const mineMoves = mine.moveLog?.length || 0
  const theirsMoves = theirs.moveLog?.length || 0
  if (theirsMoves > mineMoves) return { take: 'theirs', reason: `${theirsMoves} moves against ${mineMoves}` }
  if (mineMoves > theirsMoves) return { take: 'mine', reason: `${mineMoves} moves against ${theirsMoves}` }
  return {
    take: (theirs.savedAt || 0) > (mine.savedAt || 0) ? 'theirs' : 'mine',
    reason: 'same length, newer wins',
  }
}

/** Push the position in progress, so another device can pick it up. */
export async function pushLive(save, { cfg = loadCfg(), token = loadToken() } = {}) {
  if (!cfg.enabled || !token || !cfg.owner || !cfg.repo) return { ok: false }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, offline: true }
  try {
    const existing = await readLive(token, cfg)
    const body = JSON.stringify({ app: 'zsudoku', kind: 'live', savedAt: Date.now(), save }, null, 1)
    const { ok, status, body: res } = await call(
      token,
      `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(LIVE_PATH)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: 'zsudoku: position in progress',
          content: toBase64(body),
          branch: cfg.branch,
          ...(existing?.sha ? { sha: existing.sha } : {}),
        }),
      }
    )
    if (!ok) return { ok: false, error: describe(status, res) }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err.message || err) }
  }
}

async function readLive(token, cfg) {
  const { ok, status, body } = await call(
    token,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(LIVE_PATH)}?ref=${encodeURIComponent(cfg.branch)}`
  )
  if (status === 404) return null
  if (!ok) throw new Error(describe(status, body))
  try {
    const parsed = JSON.parse(fromBase64(body.content || ''))
    return { ...parsed, sha: body.sha }
  } catch {
    return null
  }
}

/** The position another device left, if there is one worth taking. */
export async function pullLive({ cfg = loadCfg(), token = loadToken() } = {}) {
  if (!cfg.enabled || !token || !cfg.owner || !cfg.repo) return null
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  try {
    const remote = await readLive(token, cfg)
    if (!remote?.save?.puzzle) return null
    return { save: remote.save, savedAt: remote.savedAt }
  } catch {
    return null
  }
}
