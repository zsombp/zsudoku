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
  // Hints point at the pattern before they give up the digit. Off by default
  // because Phase 3 settled that the plain hint is better for flow, and that
  // has not changed. Practice mode turns it on regardless.
  explainHints: false,
  // A rung below that again: the first press asks a question instead of
  // pointing at anything. Same default and the same reason, and practice turns
  // it on for the same reason it turns the explanation on.
  askFirst: false,
  // Offer a race against a past run of the same grid when one exists. Ambient
  // rather than a scoreboard, so it has to be possible to turn off for good
  // rather than only for this game.
  raceOffers: true,
  // The name published to the shared league file. Empty means not taking part,
  // which is the default: the league is opt-in twice over, once here and once
  // in the GitHub settings it rides on.
  leagueName: '',
  // Which save slot to reopen on launch.
  lastMode: 'casual',
  // The variant a new game uses unless one is picked explicitly.
  variant: 'classic',
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
