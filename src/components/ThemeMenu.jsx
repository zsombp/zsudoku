import { useEffect, useRef, useState } from 'react'
import { Moon, Sun } from './Icons.jsx'
import { THEMES } from './SettingsView.jsx'

const LIGHT = new Set(['paper', 'newsprint', 'contrast'])

/**
 * Theme picker in the header.
 *
 * Was a button that cycled through all six. Cycling is fine for two options and
 * miserable for six: you cannot see where you are going, and reaching the last
 * one means passing through four you did not want. A menu shows every option at
 * once, and each row renders in its own theme's tokens so you are choosing from
 * the thing itself rather than from a name.
 */
export default function ThemeMenu({ theme, onPick }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = e => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = THEMES.find(t => t.id === theme)

  return (
    <div className="themeMenuWrap" ref={wrapRef}>
      <button
        ref={btnRef}
        className="iconBtn"
        aria-label={`Theme: ${current?.name || theme}. Choose theme`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {LIGHT.has(theme) ? <Moon size={17} /> : <Sun size={17} />}
      </button>

      {open && (
        <div className="themeMenu" role="menu" aria-label="Theme">
          {THEMES.map(t => (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={t.id === theme}
              className={'themeItem' + (t.id === theme ? ' on' : '')}
              // Its own tokens, so the swatch is the theme rather than a
              // guess at it.
              data-theme={t.id}
              onClick={() => {
                onPick(t.id)
                setOpen(false)
              }}
            >
              <span className="themeSwatch">
                <span className="tsBoard">
                  {Array.from({ length: 9 }, (_, i) => (
                    <span
                      key={i}
                      className={'tsCell' + (i === 4 ? ' sel' : i === 1 || i === 5 ? ' given' : '')}
                    />
                  ))}
                </span>
              </span>
              <span className="themeItemText">
                <span className="themeItemName">{t.name}</span>
                <span className="themeItemDesc">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
