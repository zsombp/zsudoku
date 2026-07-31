import { useEffect, useRef, useState } from 'react'
import * as gameLog from '../lib/gameLog.js'
import { dayKey } from '../logic/daily.js'

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
        <h2 className="statHeading">Appearance</h2>
        <Row label="Theme" hint="Follows nothing but this switch, on purpose.">
          <div className="segmented">
            {['dark', 'light'].map(t => (
              <button
                key={t}
                className={'seg' + (settings.theme === t ? ' on' : '')}
                onClick={() => updateSettings({ theme: t })}
              >
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </Row>
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
        <Row label="Show mistakes" hint="Marks a digit red as soon as it disagrees with the solution.">
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
          {' '}Nothing is uploaded anywhere, so nothing is backed up unless you export it.
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

      <section className="statSection">
        <h2 className="statHeading">About</h2>
        <p className="dataNote">
          Zsudoku is offline, free, and has no accounts, ads or tracking of any kind. It makes no
          network requests at all once loaded. Everything it knows about you is in the export file
          and nowhere else.
        </p>
      </section>
    </div>
  )
}
