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
// per game (`endedAt-seed`). That is deliberately more than a one-way backup
// needs: `mergeShard` also reports what the remote had and this device did not,
// which is exactly what two-way sync would apply locally. Sync is not wired up,
// but nothing here has to be rebuilt to add it.

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
  if (status === 404) return { games: [], sha: null }
  if (!ok) throw new Error(describe(status, body))
  try {
    const parsed = JSON.parse(fromBase64(body.content || ''))
    return { games: Array.isArray(parsed?.games) ? parsed.games : [], sha: body.sha }
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
export function mergeShard(remote, local) {
  const byId = new Map()
  for (const g of remote) if (g?.id) byId.set(g.id, g)

  const added = []
  for (const g of local) {
    if (!g?.id) continue
    if (!byId.has(g.id)) added.push(g)
    // Local wins on a genuine collision: the device that played the game holds
    // the better copy, and ids embed the end time so a real clash is unlikely.
    byId.set(g.id, g)
  }

  const localIds = new Set(local.map(g => g?.id))
  const remoteOnly = remote.filter(g => g?.id && !localIds.has(g.id))

  const merged = [...byId.values()].sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0))
  return { merged, added, remoteOnly }
}

async function writeShard(token, { owner, repo, branch }, shard, games, sha) {
  const content = JSON.stringify(
    { app: 'zsudoku', schema: 1, shard, updatedAt: new Date().toISOString(), games },
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

export async function backup(games, { cfg = loadCfg(), token = loadToken(), force = false } = {}) {
  if (!token || !cfg.owner || !cfg.repo) {
    return { ok: false, error: 'Backup is not configured.', cfg }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // Not an error worth reporting: it will go out next time.
    return { ok: false, offline: true, cfg }
  }

  const buckets = new Map()
  for (const g of games) {
    if (!g?.id) continue
    const shard = shardFor(g)
    if (!buckets.has(shard)) buckets.set(shard, [])
    buckets.get(shard).push(g)
  }

  const next = { ...cfg, shards: { ...cfg.shards } }
  let pushed = 0
  let sent = 0

  // The fingerprint cache says "this month has not changed here since the last
  // push", which is only half the question: it assumes the remote has not
  // changed either. Delete a file on GitHub and every future push skips that
  // month forever, leaving a backup that believes it is complete and is not.
  //
  // So once a day, check every shard rather than trusting the cache. It costs
  // one read per month of history and writes nothing when all is well, because
  // a shard the remote already holds in full is skipped after the read.
  const stale = Date.now() - (cfg.lastCheckAt || 0) > RECHECK_MS
  const trustCache = !force && !stale

  for (const [shard, local] of buckets) {
    const mark = fingerprint(local.map(g => g.id))
    const known = next.shards[shard]
    // Nothing new in this month since the last successful push.
    if (trustCache && known?.fingerprint === mark) continue

    try {
      const remote = await readShard(token, next, shard)
      const { merged, added } = mergeShard(remote.games, local)
      // The remote may already hold everything this device has, which happens
      // the first time a second device backs up.
      if (!force && !added.length && remote.sha) {
        next.shards[shard] = { sha: remote.sha, fingerprint: mark }
        continue
      }
      const sha = await writeShard(token, next, shard, merged, remote.sha)
      next.shards[shard] = { sha, fingerprint: mark }
      pushed++
      sent += added.length
    } catch (err) {
      next.lastError = String(err.message || err)
      return { ok: false, error: next.lastError, cfg: next, pushed, sent }
    }
  }

  next.lastPushAt = Date.now()
  if (force || stale) next.lastCheckAt = Date.now()
  next.lastError = null
  return { ok: true, cfg: next, pushed, sent }
}
