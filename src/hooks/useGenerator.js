import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as cache from '../lib/puzzleCache.js'

// Owns the generator worker and the pre-generation cache.
//
// request(tier) resolves immediately from the cache when a puzzle is waiting,
// and otherwise asks the worker. Either way it kicks off generation of the next
// one for that tier in the background, so the second New Game of an evening is
// always instant even at Diabolical.

export function useGenerator() {
  const workerRef = useRef(null)
  const pendingRef = useRef(new Map())
  const nextIdRef = useRef(1)

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL('../workers/generator.worker.js', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = event => {
      const { id, made, error } = event.data
      const entry = pendingRef.current.get(id)
      if (!entry) return
      pendingRef.current.delete(id)
      if (error) entry.reject(new Error(error))
      else entry.resolve(made)
    }
    workerRef.current = worker
    return worker
  }, [])

  useEffect(() => () => {
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  const generate = useCallback(
    (tier, seed, practice) =>
      new Promise((resolve, reject) => {
        const id = nextIdRef.current++
        pendingRef.current.set(id, { resolve, reject })
        ensureWorker().postMessage({ id, tier, seed, practice })
      }),
    [ensureWorker]
  )

  /** A puzzle that requires a given technique. Never cached: it is a request
   *  for one specific property, not for "a Hard puzzle". */
  const practice = useCallback(technique => generate(null, undefined, technique), [generate])

  /** Fills the cache for a tier if it is empty. Fire and forget. */
  const prefetch = useCallback(
    tier => {
      if (cache.has(tier)) return
      generate(tier)
        .then(made => cache.put(tier, made))
        .catch(() => {})
    },
    [generate]
  )

  const request = useCallback(
    async (tier, { seed } = {}) => {
      // A seeded request wants one specific puzzle (the daily), so the cache of
      // randomly seeded ones is no help and must not be consumed.
      if (seed !== undefined) return generate(tier, seed)

      const ready = cache.take(tier)
      if (ready) {
        // Refill straight away, while the player starts on this one.
        setTimeout(() => prefetch(tier), 0)
        return ready
      }
      const made = await generate(tier)
      setTimeout(() => prefetch(tier), 0)
      return made
    },
    [generate, prefetch]
  )

  // Stable identity. Returning a fresh object literal here makes every consumer
  // that lists the generator as a dependency re-run on every render, which in
  // App means startNew is rebuilt constantly and effects keyed on it loop.
  return useMemo(() => ({ request, prefetch, practice }), [request, prefetch, practice])
}
