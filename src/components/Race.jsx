import { fmtMs } from '../lib/format.js'
import { Explain, Term, TermGroup } from './Term.jsx'

/**
 * Racing a past run of this grid, or the engine.
 *
 * Two pieces, both deliberately small. The offer only appears on a grid this
 * device has actually finished before, so it is an answer to a question you
 * might reasonably ask rather than an advertisement, and it can be turned off
 * for good in settings rather than only for this game.
 *
 * The strip is ambient. It says where the race stands and nothing else: no
 * cheering, no warning, no colour on the losing side beyond the one the app
 * already uses for a wrong digit, and an X that ends it. A sudoku is not a
 * scoreboard, and a race you cannot switch off is nagging.
 */
export function RaceOffer({ mine, engine, onRace, onDismiss }) {
  if (!mine && !engine) return null
  return (
    <div className="raceOffer">
      <div className="raceOfferText">
        <span className="raceOfferTitle">
          {mine ? 'You have solved this grid before' : 'A grid you have not played before'}
        </span>
        <span className="raceOfferSub">
          {mine
            ? 'Run that solve alongside this one and see where it goes differently.'
            : 'The engine can pace you instead, one rung of the ladder at a time.'}
        </span>
      </div>
      <div className="raceOfferBtns">
        {mine && (
          <button className="newBtn" onClick={() => onRace('mine')}>
            {mine.label}
          </button>
        )}
        {engine && (
          <button className="newBtn" onClick={() => onRace('engine')}>
            {engine.label}
          </button>
        )}
        <button className="linkBtn" onClick={onDismiss}>no thanks</button>
      </div>
      {/* The offer is the only place with room to say what a race is, and it is
          the only moment it can be taken: the comparison is at the same point
          on the clock, so joining late is not offered rather than bent. */}
      <Explain id="ghostRacing" className="explain raceExplain" />
      {engine && !mine && <Explain id="enginePace" className="explain raceExplain" />}
    </div>
  )
}

/**
 * Where the race stands, in one line.
 *
 * Two numbers because they answer different questions and often disagree. Cells
 * is the honest instantaneous score; the clock margin is the one that survives a
 * stretch where you are both stuck, and it is null once you pass a run that was
 * abandoned, which is exactly when there is nothing left to compare against.
 */
export function RaceStrip({ ghost, race, onStop }) {
  if (!ghost || !race) return null
  const level = race.diff === 0
  const state = level ? 'level' : race.ahead ? 'ahead' : 'behind'
  return (
    /* Two numbers that often disagree, mid-game, with no room beside them for
       a word of explanation. Both are triggers and the answer drops in under
       the strip, which is the only shape that works here: this sits above the
       board and a standing key would cost board space every game. */
    <TermGroup>
      <div className={'raceStrip ' + state}>
        <span className="raceWho"><Term id="ghost">{ghost.label}</Term></span>
        <span className="raceScore" aria-live="polite">
          <Term id="raceCells">
            {level
              ? 'level'
              : `${race.by} ${race.by === 1 ? 'cell' : 'cells'} ${race.ahead ? 'up' : 'down'}`}
          </Term>
          {race.byMs !== null && Math.abs(race.byMs) >= 1000 && (
            <span className="raceClock">
              {' · '}
              <Term id="raceClock">
                {fmtMs(Math.abs(race.byMs))} {race.byMs > 0 ? 'up' : 'down'}
              </Term>
            </span>
          )}
        </span>
        <button className="raceStop" aria-label="Stop the race" onClick={onStop}>×</button>
      </div>
    </TermGroup>
  )
}
