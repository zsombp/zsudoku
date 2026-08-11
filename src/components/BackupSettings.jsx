import { useEffect, useState } from 'react'
import * as gameLog from '../lib/gameLog.js'
import * as backup from '../lib/backup.js'
import { fmtWhen } from '../lib/format.js'

/**
 * Backup to a GitHub repository you own.
 *
 * The whole section is a deliberate exception to the rule that this app makes
 * no network requests, so it says so plainly rather than hiding behind a
 * switch. Nothing here runs until it is turned on and a token is pasted in.
 *
 * The setup is checked against GitHub before it is accepted, because "saved"
 * is not the same as "works", and a backup you believe in but that has been
 * failing for three weeks is worse than no backup at all.
 */
export default function BackupSettings() {
  const [cfg, setCfg] = useState(() => backup.loadCfg())
  const [token, setToken] = useState(() => backup.loadToken())
  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)
  const [problem, setProblem] = useState(() => backup.loadCfg().lastError)

  useEffect(() => {
    backup.saveCfg(cfg)
  }, [cfg])

  const configured = Boolean(token && cfg.owner && cfg.repo)

  async function connect() {
    setBusy('verify')
    setNotice(null)
    setProblem(null)
    const res = await backup.verify({ token, owner: cfg.owner.trim(), repo: cfg.repo.trim() })
    setBusy(null)
    if (!res.ok) {
      setProblem(res.error)
      return
    }
    backup.saveToken(token)
    setCfg(c => ({
      ...c,
      enabled: true,
      owner: c.owner.trim(),
      repo: c.repo.trim(),
      branch: res.branch || c.branch,
      lastError: null,
    }))
    setNotice(
      res.private
        ? 'Connected. Backups will run after each finished game.'
        : 'Connected, but that repository is public, so anyone can read your game history. A private one is the better home for it.'
    )
  }

  async function pushNow() {
    setBusy('push')
    setNotice(null)
    setProblem(null)
    const games = await gameLog.all()
    const res = await backup.backup(games, { cfg, token, force: true })
    setCfg(res.cfg)
    setBusy(null)
    if (res.ok) {
      setNotice(
        res.pushed
          ? `Backed up ${games.length} ${games.length === 1 ? 'game' : 'games'} across ${res.pushed} ${res.pushed === 1 ? 'file' : 'files'}.`
          : 'Already up to date.'
      )
    } else if (res.offline) {
      setProblem('No connection. This will go out next time you are online.')
    } else {
      setProblem(res.error)
    }
  }

  function disconnect() {
    backup.saveToken('')
    setToken('')
    // The shard bookkeeping goes too: reconnecting to a different repository
    // with stale file shas would fail every push with a conflict.
    setCfg(c => ({ ...backup.DEFAULT_CFG, owner: c.owner, repo: c.repo }))
    setNotice('Disconnected. The token has been removed from this device.')
  }

  return (
    <section className="statSection">
      <h2 className="statHeading">Backup to GitHub</h2>
      <p className="dataNote">
        The one thing in this app that touches the network, and it stays off until you turn it on.
        It talks to github.com and nothing else, sends only your game history, and the app works
        exactly the same offline with it running or not.
      </p>

      {!configured || !cfg.enabled ? (
        <>
          <p className="dataNote">
            You need a fine-grained personal access token with <strong>Contents: read and write</strong> on
            one private repository, and nothing else. Make an empty private repository first, then
            create the token scoped to only that repository.
          </p>
          <div className="fieldRow">
            <label className="field">
              <span className="fieldLabel">Owner</span>
              <input
                className="fieldInput"
                value={cfg.owner}
                placeholder="your-github-username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                onChange={e => setCfg(c => ({ ...c, owner: e.target.value }))}
              />
            </label>
            <label className="field">
              <span className="fieldLabel">Repository</span>
              <input
                className="fieldInput"
                value={cfg.repo}
                placeholder="zsudoku-data"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                onChange={e => setCfg(c => ({ ...c, repo: e.target.value }))}
              />
            </label>
          </div>
          <label className="field">
            <span className="fieldLabel">Token</span>
            <input
              className="fieldInput"
              type="password"
              value={token}
              placeholder="github_pat_..."
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              onChange={e => setToken(e.target.value)}
            />
          </label>
          <p className="dataNote">
            The token is kept on this device only. It is never written into the app, never included
            in an export, and never sent anywhere except github.com.
          </p>
          <div className="dataRow">
            <button className="newBtn" disabled={busy === 'verify'} onClick={connect}>
              {busy === 'verify' ? 'Checking with GitHub…' : 'Connect'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="dataNote">
            Backing up to <strong>{cfg.owner}/{cfg.repo}</strong>, one file per month under{' '}
            <code>games/</code>.{' '}
            {cfg.lastPushAt
              ? `Last backup ${fmtWhen(cfg.lastPushAt)}.`
              : 'Nothing has been sent yet.'}
          </p>
          <div className="dataRow">
            <button className="newBtn" disabled={busy === 'push'} onClick={pushNow}>
              {busy === 'push' ? 'Backing up…' : 'Back up now'}
            </button>
            <button className="newBtn" onClick={disconnect}>Disconnect</button>
          </div>
        </>
      )}

      {notice && <p className="dataNote notice">{notice}</p>}
      {problem && <p className="techError">{problem}</p>}
    </section>
  )
}
