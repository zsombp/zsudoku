// A puzzle as a word.
//
// Every puzzle this app makes is already reproducible from a seed, a tier and a
// variant, because that is what the daily has needed since Phase 6. So sharing
// one is sharing those three things, and the whole of the "social" idea needs
// no server, no account and no upload.
//
// The code is deliberately not a URL. A short string can be read aloud, typed
// with a thumb, or pasted into a message, and it does not rot when the app
// moves. Anything that needed a link would need somewhere to host it.

import { VARIANTS } from './variants.js'
import { TIERS } from './difficulty.js'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const VARIANT_CODE = { classic: 'C', jigsaw: 'J', x: 'X', windoku: 'W', antiknight: 'K' }
const CODE_VARIANT = Object.fromEntries(Object.entries(VARIANT_CODE).map(([k, v]) => [v, k]))

/** Base32 without the characters people mistype: no 0/O, no 1/I. */
const encode = n => {
  let out = ''
  let x = n >>> 0
  do {
    out = ALPHABET[x % 32] + out
    x = Math.floor(x / 32)
  } while (x > 0)
  return out
}

const decode = s => {
  let x = 0
  for (const ch of s.toUpperCase()) {
    const i = ALPHABET.indexOf(ch)
    if (i < 0) return null
    x = x * 32 + i
  }
  return x >>> 0
}

/**
 * A puzzle code: one letter for the board, one for the tier, then the seed.
 *
 * Grouped in fours because that is how anyone reads a code back to someone.
 */
export function encodePuzzle({ variant = 'classic', tier, seed }) {
  const v = VARIANT_CODE[variant]
  const t = TIERS.findIndex(x => x.name === tier)
  if (!v || t < 0 || seed === undefined) return null
  const body = v + ALPHABET[t] + encode(seed)
  return body.match(/.{1,4}/g).join('-')
}

export function decodePuzzle(code) {
  if (!code) return null
  const clean = String(code).toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (clean.length < 3) return null

  const variant = CODE_VARIANT[clean[0]]
  const tier = TIERS[ALPHABET.indexOf(clean[1])]?.name
  const seed = decode(clean.slice(2))
  if (!variant || !tier || seed === null) return null
  return { variant, tier, seed }
}

/** Does this code describe a puzzle this app can actually build? */
export const isPuzzleCode = code => {
  const p = decodePuzzle(code)
  return Boolean(p && VARIANTS[p.variant])
}
