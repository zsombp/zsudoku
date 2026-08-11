/** Milliseconds to m:ss, or h:mm:ss once it runs past an hour. */
export function fmtMs(ms) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

/**
 * "just now", "3 hours ago", "on 12 June". Relative while it is still useful,
 * absolute once "47 days ago" stops meaning anything.
 */
export function fmtWhen(ts) {
  if (!ts) return 'never'
  const secs = Math.max(0, (Date.now() - ts) / 1000)
  if (secs < 90) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  return `on ${new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
}
