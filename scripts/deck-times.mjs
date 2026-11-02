import { buildDeck } from '../src/logic/flashcards.js'
for (const technique of ['cageCombo', 'cageSum', 'cageSingle', 'sum45', 'cageLocked', 'pointing', 'nakedPair']) {
  const times = []
  const sizes = []
  for (const seed of [1234, 7001, 42]) {
    const start = performance.now()
    sizes.push(buildDeck(technique, { count: 5, budgetMs: 9000, seed }).length)
    times.push(Math.round(performance.now() - start))
  }
  console.log(JSON.stringify({ technique, sizes, ms: times }))
}
