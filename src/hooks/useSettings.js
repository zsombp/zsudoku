import { useCallback, useEffect, useState } from 'react'
import { KEYS, getSync, set } from '../lib/storage.js'

// Settings are separate from game state on purpose: they outlive any single
// game, and losing a save should never cost you your preferences.
//
// `theme` is a string rather than a boolean so Phase 4 can add themes without
// touching the persisted shape. 'dark' and 'light' are the two that exist now.

// Themes were called dark/light before Phase 4 gave them names.
const LEGACY_THEME = { dark: 'ink', light: 'paper' }

// Exported so the defaults can be asserted without a browser. Which switches
// start off is a product decision rather than an implementation detail, and it
// is the kind that gets changed by accident while adding the next one.
export const DEFAULTS = {
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
  // A pad to write digits on with a finger. Off by default, and it has to be:
  // the recogniser is right somewhere between 98% and 84% of the time depending
  // on how steady the hand is, against a number pad that is right every time,
  // so this is a thing to want rather than a better default.
  handwriting: false,
  // Offer a race against a past run of the same grid when one exists. Ambient
  // rather than a scoreboard, so it has to be possible to turn off for good
  // rather than only for this game.
  raceOffers: true,
  // Speak a move instead of tapping one. Off by default, and the microphone
  // never opens without a press even when it is on.
  voiceInput: false,
  // The second half of that switch, and the one that matters. Where the browser
  // cannot be told to recognise speech on the device, listening at all sends the
  // audio to Apple or to Google, which is a second exception to the rule that
  // nothing leaves this device. Unlike the GitHub backup it does not go to
  // infrastructure the user owns, so it does not clear the bar `CLAUDE.md` sets
  // for a second exception, and no screen offers it: it is held at false and
  // `App.jsx` never passes it on. Kept rather than deleted because the machinery
  // behind it is built and tested, and the only thing missing is Zsomb's own
  // answer to whether the iPhone is worth the audio leaving the device.
  voiceOffDevice: false,
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
