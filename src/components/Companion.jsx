/**
 * The companion.
 *
 * Built from the same rounded square as a board cell, at the same radius, so it
 * belongs to the app rather than visiting it. No face beyond eyes and a mouth
 * line: the moment this thing gets eyebrows and a nose it stops being part of
 * the interface and starts being a mascot from a different product.
 *
 * **Where it is allowed to appear, and why that is a short list.** Only the win
 * screen and the empty states. Never during a solve, and it never says
 * anything. A character that reacts while you are thinking is a character that
 * interrupts you, and the failure mode is not "slightly annoying": it is a
 * thing on screen implying it knows how you are doing, during the exact minutes
 * when you have decided you do not want to be told. `flow.js` is post-game for
 * the same reason, and this follows it.
 *
 * `thinking` and `stuck` are drawn and not mounted anywhere. They are here
 * because the set is only coherent as a set, and because the day there is a
 * screen that has genuinely earned them, drawing them again from memory would
 * produce a different character. They are not a shipped feature and the
 * CHANGELOG says so.
 */

const FACES = {
  /* Eyes level, mouth a flat line. The resting state, used where a screen is
     empty rather than where something has gone wrong. */
  idle: (
    <>
      <circle cx="23" cy="30" r="3.4" fill="var(--accent)" />
      <circle cx="37" cy="30" r="3.4" fill="var(--accent)" />
      <path d="M25 39h10" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  /* Both eyes arced up, mouth curved. The only difference between pleased and
     blank is the curve of four strokes, which is as much face as this needs. */
  solved: (
    <>
      <path
        d="M19.5 31a4 4 0 0 1 7 0M33.5 31a4 4 0 0 1 7 0"
        stroke="var(--accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M24 39.5c2 2.5 10 2.5 12 0"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  /* Same pleased face, plus rays. Used only when a streak is actually running,
     so the rays mean something rather than being decoration on every win. */
  streak: (
    <>
      <circle cx="23" cy="31" r="3.2" fill="var(--accent)" />
      <circle cx="37" cy="31" r="3.2" fill="var(--accent)" />
      <path
        d="M24 40c2 2.5 10 2.5 12 0"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 19l4 4M51 19l-4 4M30 7v5"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  thinking: (
    <>
      <path
        d="M20 29.5h6M34 29.5h6"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="46" cy="17" r="2" fill="var(--accent)" opacity="0.85" />
      <circle cx="51" cy="12" r="1.3" fill="var(--accent)" opacity="0.55" />
    </>
  ),
  stuck: (
    <>
      <path
        d="M19 27l6 5M25 27l-6 5M35 27l6 5M41 27l-6 5"
        stroke="var(--sub)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M24 41c2-2 10-2 12 0"
        stroke="var(--sub)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
}

/**
 * `mood` picks the face. `size` is the drawn width; the box is square.
 *
 * The entrance animation is one-shot and lives in app.css behind
 * prefers-reduced-motion, like everything else that moves here.
 */
export default function Companion({ mood = 'idle', size = 64, className = '' }) {
  const face = FACES[mood] || FACES.idle
  const lit = mood === 'solved' || mood === 'streak'
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 60"
      width={size}
      height={size}
      className={'companion ' + className}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="12"
        y={mood === 'streak' ? 18 : 14}
        width="36"
        height={mood === 'streak' ? 30 : 34}
        rx="10"
        fill="var(--panel2)"
        stroke={lit ? 'var(--accent)' : 'var(--line-strong)'}
        strokeWidth="1.5"
      />
      {face}
    </svg>
  )
}
