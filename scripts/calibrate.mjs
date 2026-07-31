// Difficulty calibration.
//
//   node scripts/calibrate.mjs explore [samplesPerClueCount]
//       Samples the raw score distribution by clue count, ignoring the
//       configured bands. This is what the numbers in difficulty.js come from.
//       Run it again after ANY change to the ladder or its costs: both move the
//       whole scale, and stale bands mean dishonest labels.
//
//   node scripts/calibrate.mjs [samplesPerTier]
//       Verifies the configured bands: exact-tier hit rate, score spread,
//       technique mix and timing per tier.

import { generateFull, dig, makePuzzle } from '../src/logic/generator.js'
import { gradePuzzle, createState, nextStep, applyStep, forcedFills, trivialTail } from '../src/logic/grader.js'
import { hasUniqueSolution } from '../src/logic/solver.js'
import { TIERS, tierForScore } from '../src/logic/difficulty.js'
import { TECHNIQUES } from '../src/logic/techniques.js'
import { mulberry32 } from '../src/lib/prng.js'

const pctl = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
const pct = (a, b) => `${((a / b) * 100).toFixed(0)}%`

function explore(n) {
  const samples = []
  let unfair = 0
  let total = 0

  for (let clues = 46; clues >= 22; clues -= 2) {
    for (let i = 0; i < n; i++) {
      total++
      const rng = mulberry32(clues * 1000 + i)
      const solution = generateFull(rng)
      const puzzle = dig(solution, clues, rng)
      const g = gradePuzzle(puzzle)
      if (!g.solved) { unfair++; continue }
      samples.push({ clues, score: g.score, hardest: g.hardest || 'nakedSingle', counts: g.counts })
    }
  }

  // Where the bands go. Difficulty is dominated by the hardest thing you have
  // to spot, so grouping by that is what the tier boundaries should follow.
  console.log(`\nScore distribution by hardest technique required. ${total} grids sampled, ` +
    `${pct(unfair, total)} discarded as unfair (needed a guess).\n`)
  console.log('hardest technique      n     p10     p25     p50     p75     p90     max')
  console.log('-'.repeat(78))

  for (const key of Object.keys(TECHNIQUES)) {
    const group = samples.filter(s => s.hardest === key).map(s => s.score).sort((a, b) => a - b)
    if (!group.length) { console.log(`${key.padEnd(20)}   0   never reached`); continue }
    console.log(
      `${key.padEnd(20)} ${String(group.length).padStart(3)}   ` +
      [0.1, 0.25, 0.5, 0.75, 0.9].map(p => String(pctl(group, p)).padStart(5)).join('   ') +
      `   ${String(group[group.length - 1]).padStart(5)}`
    )
  }

  // The check that the previous pricing failed. If score still tracks blank
  // count, the number is measuring board size rather than difficulty.
  console.log('\nSize independence: score by clue count, within naked-singles-only puzzles.')
  console.log('These should be flat. If they climb with fewer clues, the scoring is wrong again.\n')
  console.log('clues    n    p50 score')
  console.log('-'.repeat(28))
  for (let clues = 46; clues >= 30; clues -= 4) {
    const group = samples.filter(s => s.clues === clues && s.hardest === 'nakedSingle')
      .map(s => s.score).sort((a, b) => a - b)
    if (group.length) {
      console.log(`${String(clues).padStart(5)}  ${String(group.length).padStart(3)}    ${String(pctl(group, 0.5)).padStart(9)}`)
    }
  }
  console.log()
}

function verify(n) {
  console.log(`\nBand check, ${n} puzzles per tier.\n`)
  console.log('tier          hit   score p50   clues   median ms   worst ms   graded as')
  console.log('-'.repeat(96))

  let totalUnfair = 0

  for (const tier of TIERS) {
    const times = []
    const scores = []
    const clues = []
    const landed = {}
    let hits = 0

    for (let i = 0; i < n; i++) {
      const t0 = performance.now()
      const made = makePuzzle(tier.name, { seed: 50000 + i })
      times.push(performance.now() - t0)
      if (!made) { landed.FAILED = (landed.FAILED || 0) + 1; continue }

      scores.push(made.score)
      clues.push(made.clues)
      landed[made.graded] = (landed[made.graded] || 0) + 1
      if (made.graded === tier.name) hits++

      // Contracts that must hold for every puzzle that ships.
      if (!hasUniqueSolution(made.puzzle)) throw new Error(`${tier.name} #${i}: not unique`)
      const re = gradePuzzle(made.puzzle)
      if (!re.solved) { totalUnfair++; throw new Error(`${tier.name} #${i}: needs a guess`) }
      if (re.score !== made.score) throw new Error(`${tier.name} #${i}: grade not reproducible`)
      if (tierForScore(re.score).name !== made.graded) throw new Error(`${tier.name} #${i}: label disagrees with score`)
    }

    times.sort((a, b) => a - b)
    scores.sort((a, b) => a - b)
    clues.sort((a, b) => a - b)
    const spread = Object.entries(landed).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')

    console.log(
      `${tier.name.padEnd(12)} ${pct(hits, n).padStart(4)}   ${String(pctl(scores, 0.5)).padStart(9)}   ` +
      `${String(pctl(clues, 0.5)).padStart(5)}   ${pctl(times, 0.5).toFixed(0).padStart(9)}   ` +
      `${times[times.length - 1].toFixed(0).padStart(8)}   ${spread}`
    )
  }

  console.log(`\nPuzzles requiring a guess that reached the caller: ${totalUnfair}. Must be 0.`)

  // Which techniques the ladder actually exercises. A rung that never fires is
  // dead weight, and one that fires everywhere is probably mispriced.
  const usage = {}
  for (const tier of TIERS) {
    for (let i = 0; i < Math.max(4, Math.floor(n / 3)); i++) {
      const made = makePuzzle(tier.name, { seed: 90000 + i })
      if (made) for (const [k, v] of Object.entries(made.counts)) usage[k] = (usage[k] || 0) + v
    }
  }
  console.log('\nTechnique usage across all tiers:')
  for (const key of Object.keys(TECHNIQUES)) {
    console.log(`  ${key.padEnd(14)} ${String(usage[key] || 0).padStart(6)}${usage[key] ? '' : '   never fires'}`)
  }
  console.log()
}

/**
 * When does the strict auto-complete trigger actually fire?
 *
 * Strict means every remaining cell has exactly one candidate at once. That is
 * a late state by construction, and if it only ever fires with three cells left
 * the button is decoration. This measures it instead of assuming, by walking a
 * solve in the grader's own order and checking after every placement.
 */
function autocomplete(n) {
  console.log(`\nAuto-complete trigger points, ${n} puzzles per tier.`)
  console.log('"cells left" is how many were still empty when the button would appear.\n')
  console.log('STRICT   every empty cell has exactly one candidate at once. What ships.')
  console.log('CASCADE  the rest falls to naked singles, each revealing the next.')
  console.log('         Looser, fires earlier, and still asks you to spot each forced cell.\n')
  console.log('tier          strict p50   strict max   cascade p50   cascade max   gap (p50)')
  console.log('-'.repeat(84))

  const totals = { strict: [], cascade: [] }

  for (const tier of TIERS) {
    const strict = []
    const cascade = []

    for (let i = 0; i < n; i++) {
      const made = makePuzzle(tier.name, { seed: 70000 + i })
      if (!made) continue

      const state = createState(made.puzzle)
      let hitStrict = null
      let hitCascade = null

      for (let s = 0; s < 400; s++) {
        const empties = state.board.reduce((a, v) => a + (v ? 0 : 1), 0)
        if (hitCascade === null && trivialTail(state.board)) hitCascade = empties
        if (hitStrict === null && forcedFills(state.board)) { hitStrict = empties; break }
        const step = nextStep(state)
        if (!step) break
        applyStep(state, step)
      }
      if (hitStrict !== null) strict.push(hitStrict)
      if (hitCascade !== null) cascade.push(hitCascade)
    }

    strict.sort((a, b) => a - b)
    cascade.sort((a, b) => a - b)
    totals.strict.push(...strict)
    totals.cascade.push(...cascade)

    const sp50 = pctl(strict, 0.5)
    const cp50 = pctl(cascade, 0.5)
    console.log(
      `${tier.name.padEnd(12)} ${String(sp50).padStart(10)}   ${String(strict[strict.length - 1] ?? 0).padStart(10)}   ` +
      `${String(cp50).padStart(11)}   ${String(cascade[cascade.length - 1] ?? 0).padStart(11)}   ` +
      `${String(cp50 - sp50).padStart(9)}`
    )
  }

  totals.strict.sort((a, b) => a - b)
  totals.cascade.sort((a, b) => a - b)
  console.log(
    `\nOverall median: strict ${pctl(totals.strict, 0.5)} cells left, ` +
    `cascade ${pctl(totals.cascade, 0.5)} cells left.\n`
  )
}

const mode = process.argv[2]
if (mode === 'explore') explore(Number(process.argv[3] || 30))
else if (mode === 'autocomplete') autocomplete(Number(process.argv[3] || 12))
else verify(Number(process.argv[2] || 20))
