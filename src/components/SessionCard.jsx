import { TECHNIQUES } from '../logic/techniques.js'
import { STAGES, STAGE_LABEL, nextStage, isComplete, sessionStreak } from '../stats/session.js'
import { TechGlyph } from './Glyphs.jsx'

/**
 * Today's session on the home screen: the day's pattern, its three steps, and
 * one button for whichever comes next.
 *
 * Not a button itself, unlike the cards around it, because it holds two: the
 * next step, and putting the puzzle off when the evening has no twenty minutes
 * in it.
 */
export default function SessionCard({ session, busy, error, replacesGame, onGo, onSkipPuzzle }) {
  if (!session || !TECHNIQUES[session.technique]) return null
  const next = nextStage(session)
  const complete = isComplete(session)
  const streak = sessionStreak(session.history)
  const name = TECHNIQUES[session.technique].label
  // A title, so it starts with a capital: the ladder's labels are lowercase
  // for use mid-sentence ("a pointing pair").
  const label = name.charAt(0).toUpperCase() + name.slice(1)
  // The schedule's reasons run to two or three sentences. The first one is the
  // evidence; the rest is timing, which the practice screen still shows.
  const why = (session.line || '').match(/^.*?\.(?=\s|$)/)?.[0] || session.line || ''

  const waiting =
    busy === 'session' || busy === 'cards:' + session.technique || busy === session.technique
  const goLabel = waiting
    ? next === 'drill'
      ? 'Dealing five cards…'
      : next === 'puzzle'
        ? 'Finding a puzzle…'
        : 'Opening…'
    : next === 'lesson'
      ? 'Start with the lesson'
      : next === 'drill'
        ? 'Next: five cards'
        : 'Next: one puzzle'

  return (
    <div className={'card cardSession' + (next ? '' : ' isDone')}>
      <span className="cardKicker">
        Today's session
        {streak > 0 && <span className="streakPip">{streak}</span>}
      </span>
      <span className="sessionTitle">
        <TechGlyph technique={session.technique} size={22} className="techGlyph sessionGlyph" />
        <span className="cardTitle">{label}</span>
      </span>
      <span className="cardMeta sessionWhy">
        {next
          ? why
          : complete
            ? `Done for today${streak > 1 ? `, ${streak} days running` : ''}. Tomorrow picks again.`
            : 'Over for today. A day counts once the five cards are done.'}
      </span>

      <ol className="sessionSteps" aria-label="Steps">
        {STAGES.map(s => {
          const state = session.stages[s] || (s === next ? 'next' : 'todo')
          return (
            <li key={s} className={'sessionStep ' + state}>
              <span className="sessionPip" aria-hidden="true" />
              {STAGE_LABEL[s]}
              <span className="srOnly">
                {state === 'done' ? ', done' : state === 'skipped' ? ', put off' : state === 'next' ? ', next' : ''}
              </span>
            </li>
          )
        })}
      </ol>

      {next && (
        <>
          {next === 'puzzle' && replacesGame && (
            <span className="cardMeta sessionNote">It replaces the game in progress.</span>
          )}
          <span className="dataRow sessionBtns">
            <button className="newBtn" disabled={Boolean(busy)} onClick={onGo}>
              {goLabel}
            </button>
            {next === 'puzzle' && (
              <button className="linkBtn" disabled={Boolean(busy)} onClick={onSkipPuzzle}>
                not today
              </button>
            )}
          </span>
          {error && !busy && <span className="techError">{error}</span>}
        </>
      )}
    </div>
  )
}
