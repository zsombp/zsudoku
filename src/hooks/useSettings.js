import { useCallback, useEffect, useState } from 'react'
import { KEYS, getSync, set } from '../lib/storage.js'

// Settings are separate from game state on purpose: they outlive any single
// game, and losing a save should never cost you your preferences.
//
// `theme` is a string rather than a boolean so Phase 4 can add themes without
// touching the persisted shape. 'dark' and 'light' are the two that exist now.

// Themes were called dark/light before Phase 4 gave them names.
const LEGACY_THEME = { dark: 'ink', light: 'paper' }

const DEFAULTS = {
  theme: 'ink',
  checkErrors: true,
  autoPencilOnStart: false,
  // Quick input: arm a digit on the pad, then tap cells to fill them.
  quickInput: false,
  // Outline the empty cells the highlighted digit could legally occupy.
  candidateHints: true,
  // Synthesised, and off by default: a sudoku that makes noise you did not ask
  // for is worse than a silent one.
  sound: false,
  // Which save slot to reopen on launch.
  lastMode: 'casual',
}

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    const saved = getSync(KEYS.settings) || {}
    if (LEGACY_THEME[saved.theme]) saved.theme = LEGACY_THEME[saved.theme]
    return { ...DEFAULTS, ...saved }
  })

  useEffect(() => {
    set(KEYS.settings, settings)
  }, [settings])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const update = useCallback(patch => setSettings(s => ({ ...s, ...patch })), [])

  return [settings, update]
}
