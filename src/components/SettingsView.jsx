import { useEffect, useRef, useState } from 'react'
import * as gameLog from '../lib/gameLog.js'
import { dayKey } from '../logic/daily.js'
import BackupSettings from './BackupSettings.jsx'

export const THEMES = [
  { id: 'ink', name: 'Ink & Brass', desc: 'The original. Deep blue, warm brass.' },
  { id: 'paper', name: 'Paper', desc: 'Clean and bright for daylight.' },
  { id: 'midnight', name: 'Midnight', desc: 'True black and ice, gentle on OLED.' },
  { id: 'nord', name: 'Nord', desc: 'Muted arctic blue-greys, soft frost.' },
  { id: 'newsprint', name: 'Newsprint', desc: 'Warm cream and red ink.' },
  { id: 'contrast', name: 'High Contrast', desc: 'Maximum legibility, black on white.' },
]

function Row({ label, hint, children }) {
  return (
    <div className="setRow">
      <div className="setText">
        <div className="setLabel">{label}</div>
        {hint && <div className="setHint">{hint}</div>}
      </div>
      <div className="setControl">{children}</div>
    </div>
  )
}

function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} />
      <span className="switchTrack" aria-hidden="true"><span className="switchThumb" /></span>
    </label>
  )
}

export default function SettingsView({ settings, updateSettings, onClose }) {
  const [count, setCount] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [notice, setNotice] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    gameLog.all().then(g => setCount(g.length))
  }, [])

  async function doExport() {
    const json = await gameLog.exportJson()
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `zsudoku-backup-${dayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setNotice(`Exported ${count} games.`)
  }

  async function doImport(file) {
    try {
      const r = await gameLog.importJson(await file.text())
      setCount((await gameLog.all()).length)
      setNotice(`Imported ${r.added}, skipped ${r.skipped} already here.`)
    } catch (err) {
      setNotice(String(err.message || err))
    }
  }

  async function doClear() {
    // Two taps, never one. This is the only irreversible thing in the app.
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    await gameLog.clearAll()
    setCount(0)
    setConfirmClear(false)
    setNotice('History deleted.')
  }

  return (
    <div className="statsView">
      <header className="top">
        <div className="brand">SETTINGS</div>
        <button className="newBtn" onClick={onClose}>Back to game</button>
      </header>

      <section className="statSection">
        <h2 className="statHeading">Theme</h2>
        <div className="themeGrid">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={'themeCard' + (settings.theme === t.id ? ' on' : '')}
              data-theme={t.id}
              onClick={() => updateSettings({ theme: t.id })}
              aria-pressed={settings.theme === t.id}
            >
              {/* A real miniature of the board, drawn in that theme's own
                  tokens, so the swatch cannot drift from the theme. */}
              <span className="themePreview">
                <span className="tpGrid">
                  {Array.from({ length: 9 }, (_, i) => (
                    <span key={i} className={'tpCell' + (i === 4 ? ' sel' : i === 2 || i === 6 ? ' given' : '')} />
                  ))}
                </span>
              </span>
              <span className="themeName">{t.name}</span>
              <span className="themeDesc">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="statSection">
        <h2 className="statHeading">Playing</h2>
        <Row label="Quick input" hint="Pick a number, then tap cells to fill them.">
          <Switch
            label="Quick input"
            checked={settings.quickInput}
            onChange={v => updateSettings({ quickInput: v })}
          />
        </Row>
        <Row
          label="Candidate hints"
          hint="Outlines every empty cell the highlighted number could still go in."
        >
          <Switch
            label="Candidate hints"
            checked={settings.candidateHints}
            onChange={v => updateSettings({ candidateHints: v })}
          />
        </Row>
        <Row
          label="Show mistakes"
          hint="Marks a digit red the moment it disagrees with the solution. Turn it off and a Check button appears instead, so you can ask when you want to."
        >
          <Switch
            label="Show mistakes"
            checked={settings.checkErrors}
            onChange={v => updateSettings({ checkErrors: v })}
          />
        </Row>
        <Row label="Sound" hint="Synthesised, not sampled. Nothing to download.">
          <Switch label="Sound" checked={settings.sound} onChange={v => updateSettings({ sound: v })} />
        </Row>
      </section>

      <section className="statSection">
        <h2 className="statHeading">Data</h2>
        <p className="dataNote">
          {count === null ? 'Counting…' : `${count} ${count === 1 ? 'game' : 'games'} recorded on this device.`}
          {' '}Everything stays on this device unless you turn on GitHub backup below.
        </p>
        <div className="dataRow">
          <button className="newBtn" onClick={doExport}>Export backup</button>
          <button className="newBtn" onClick={() => fileRef.current?.click()}>Import backup</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) doImport(f)
              e.target.value = ''
            }}
          />
        </div>
        <div className="dataRow">
          <button className={'newBtn' + (confirmClear ? ' danger' : '')} onClick={doClear}>
            {confirmClear ? 'Tap again to delete everything' : 'Delete history'}
          </button>
          {confirmClear && (
            <button className="newBtn" onClick={() => setConfirmClear(false)}>Cancel</button>
          )}
        </div>
        {notice && <p className="dataNote notice">{notice}</p>}
      </section>

      <BackupSettings />

      <section className="statSection">
        <h2 className="statHeading">About</h2>
        <p className="dataNote">
          Zsudoku is offline, free, and has no accounts, ads or tracking of any kind. The only
          network request it can ever make is the GitHub backup above, to a repository you own,
          and only once you have switched it on. There is no analytics endpoint, no error
          reporting and no third-party anything.
        </p>
      </section>
    </div>
  )
}
