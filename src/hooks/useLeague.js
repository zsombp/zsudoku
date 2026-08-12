import { useCallback, useEffect, useState } from 'react'
import * as backup from '../lib/backup.js'
import * as gameLog from '../lib/gameLog.js'
import {
  LEAGUE_DIR,
  entriesFrom,
  isLeaguePath,
  leaguePathFor,
  mergeEntries,
  parseFile,
  serialiseFile,
} from '../stats/league.js'

/**
 * Reading and writing the league files on the shared repository.
 *
 * This is the same opted-in GitHub exception the backup already is, pointed at
 * the same repository with the same token, and it does nothing at all until that
 * is switched on. No second network exception, no second credential, and with
 * backup off this file makes no request of any kind.
 *
 * The contents-API plumbing is a small copy of the one in `src/lib/backup.js`
 * rather than a shared helper, because that module does not export one and it
 * was not mine to change in this pass. It is about thirty lines and the right
 * home for it is next to `readShard` and `writeShard`; folding it in there is a
 * tidy-up worth doing the next time that file is open.
 *
 * ---- what is published ----
 *
 * One file per player, `league/<slug>.json`, holding one row per daily: the day,
 * the tier, the seed, the time, mistakes, hints, and whether it was finished.
 * No move log, no puzzle, no solution, nothing that is not a number about that
 * day. Everyone in the league can read everyone else's, which is the whole
 * mechanism and why it carries the least that answers the question.
 */

const API = 'https://api.github.com'
const CACHE_KEY = 'zsudoku.league.v1'

const loadCache = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY))
    return Array.isArray(raw?.players) ? raw : null
  } catch {
    return null
  }
}

const saveCache = value => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value))
  } catch {
    /* best effort, like every other write in this app */
  }
}

const fromBase64 = b64 => {
  const bin = atob(String(b64 || '').replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

const toBase64 = str => {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

const describe = status => {
  if (status === 401) return 'GitHub rejected the token. It may have expired or been revoked.'
  if (status === 403) return 'GitHub refused the request. Check the token has Contents write access.'
  if (status === 404) return 'Repository or branch not found, or the token cannot see it.'
  return `GitHub returned ${status}.`
}

async function call(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

/** Every player file in the repository, parsed, with the unreadable ones counted. */
async function readAll(token, cfg) {
  const dir = await call(
    token,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${LEAGUE_DIR}?ref=${encodeURIComponent(cfg.branch)}`
  )
  // No league directory yet is the normal state of a repository nobody has
  // published to, and is not an error to show anyone.
  if (dir.status === 404) return { players: [], broken: 0 }
  if (!dir.ok) throw new Error(describe(dir.status))

  const files = (Array.isArray(dir.body) ? dir.body : []).filter(
    f => f.type === 'file' && isLeaguePath(f.path)
  )

  const players = []
  let broken = 0
  for (const f of files) {
    const res = await call(
      token,
      `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(f.path)}?ref=${encodeURIComponent(cfg.branch)}`
    )
    if (!res.ok) { broken++; continue }
    // The file name is the fallback name: a file whose contents are unreadable
    // is skipped, but one that simply forgot its own name is not.
    const parsed = parseFile(fromBase64(res.body?.content), f.name.replace(/\.json$/, ''))
    if (parsed) players.push({ ...parsed, sha: res.body.sha, path: f.path })
    else broken++
  }
  return { players, broken }
}

/**
 * How long a read is trusted before the screen fetches again on its own.
 *
 * A league that re-read the repository every time Statistics was opened would
 * spend requests on a table that changes once a day, since a day's results
 * cannot arrive before that day. The Refresh button is always there for the
 * impatient.
 */
const STALE_MS = 60 * 60 * 1000

export function useLeague(name) {
  const [state, setState] = useState(() => ({
    players: loadCache()?.players || [],
    fetchedAt: loadCache()?.fetchedAt || null,
    busy: false,
    error: null,
    notice: null,
  }))

  const cfg = backup.loadCfg()
  // Opt in twice, and the name is the second one. Nothing here touches the
  // network for somebody who has only read the paragraph explaining it.
  const configured = Boolean(cfg.enabled && cfg.owner && cfg.repo && backup.loadToken())
  const ready = configured && Boolean(name)

  const refresh = useCallback(async () => {
    if (!ready) return
    setState(s => ({ ...s, busy: true, error: null, notice: null }))
    try {
      const { players, broken } = await readAll(backup.loadToken(), backup.loadCfg())
      const next = { players, fetchedAt: Date.now() }
      saveCache(next)
      setState({
        ...next,
        busy: false,
        error: null,
        notice: broken ? `${broken} file${broken === 1 ? '' : 's'} in league/ could not be read and ${broken === 1 ? 'was' : 'were'} skipped.` : null,
      })
    } catch (err) {
      setState(s => ({ ...s, busy: false, error: String(err.message || err) }))
    }
  }, [ready])

  /**
   * Publish this device's daily results under `name`.
   *
   * Reads the existing file first and merges rather than overwriting, because
   * the phone and the Mac publish under the same name and either may hold days
   * the other has never seen. `mergeEntries` keeps the published result and lets
   * only an unfinished day be replaced by a finished one, so a second device
   * cannot improve a time on a puzzle it has already seen.
   */
  const publish = useCallback(async () => {
    const path = leaguePathFor(name)
    if (!ready || !path) return
    setState(s => ({ ...s, busy: true, error: null, notice: null }))
    try {
      const token = backup.loadToken()
      const conf = backup.loadCfg()
      const mine = entriesFrom(await gameLog.all())

      const existing = await call(
        token,
        `/repos/${conf.owner}/${conf.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(conf.branch)}`
      )
      // A read that fails for any reason other than "not there yet" leaves
      // `remote` null, and the write below then carries no sha. GitHub refuses
      // to replace an existing file without one, so the worst case is a loud
      // failure rather than a file quietly overwritten with less than it held.
      const remote =
        existing.status === 404 ? null : existing.ok ? parseFile(fromBase64(existing.body?.content), name) : null
      const merged = mergeEntries(remote?.entries || [], mine)

      const send = withBranch =>
        call(token, `/repos/${conf.owner}/${conf.repo}/contents/${encodeURIComponent(path)}`, {
          method: 'PUT',
          body: JSON.stringify({
            message: `zsudoku: league, ${merged.entries.length} day${merged.entries.length === 1 ? '' : 's'} for ${name}`,
            content: toBase64(serialiseFile(name, merged.entries)),
            ...(withBranch ? { branch: conf.branch } : {}),
            ...(existing.ok && existing.body?.sha ? { sha: existing.body.sha } : {}),
          }),
        })

      let res = await send(true)
      // A repository with no commits has no branches either, so naming one that
      // does not exist yet reads as "repo not found". The backup module hit the
      // same thing and solves it the same way.
      if (!res.ok && res.status === 404 && !existing.ok) res = await send(false)
      if (!res.ok) throw new Error(describe(res.status))

      setState(s => ({
        ...s,
        busy: false,
        notice: merged.added.length
          ? `Published ${merged.added.length} new ${merged.added.length === 1 ? 'day' : 'days'}.`
          : 'Nothing new to publish. Your file was already up to date.',
      }))
      await refresh()
    } catch (err) {
      setState(s => ({ ...s, busy: false, error: String(err.message || err) }))
    }
  }, [name, ready, refresh])

  // Read on open, and only when the cached table is old enough to be worth a
  // request. The cache means the table is on screen before the request comes
  // back, and stays there with no connection at all.
  useEffect(() => {
    if (ready && Date.now() - (state.fetchedAt || 0) > STALE_MS) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return { ...state, ready, configured, cfg, refresh, publish }
}
