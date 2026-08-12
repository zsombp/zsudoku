import { useMemo, useState } from 'react'
import { toArt, toSvg, PALETTES } from '../stats/solveart.js'
import { fmtMs } from '../lib/format.js'

/**
 * The game drawn as its own solve path.
 *
 * The picture is data plus a renderer, both of them in `src/stats/solveart.js`,
 * so nothing here decides what it looks like. This is the frame, the palette
 * switch and the way to keep a copy.
 *
 * ---- saving ----
 *
 * `toSvg` names every colour as a custom property, which is right inside the app
 * and useless in a file on its own: nothing outside the document defines
 * `--accent`. So the download resolves the palette off the live root element and
 * writes the values onto the root `<svg>` element as inline custom properties.
 * The values still come from `tokens.css`, they are just carried along. The
 * alternative, substituting literals into the markup, would put six copies of
 * every colour in the file and hardcode nothing anywhere useful.
 *
 * A data URL rather than a Blob URL because there is nothing to revoke and no
 * lifetime to get wrong. Measured on a full Hard: 17KB of SVG, 24KB once
 * percent-encoded, which is nowhere near any URL limit that matters.
 */
const PALETTE_NAMES = Object.keys(PALETTES)

const PALETTE_ABOUT = {
  solve: 'One colour, with the rare moments picked out.',
  review: 'The move list colours, so it reads with the key beside it.',
  mono: 'For paper. Wrong digits and real patterns keep their shapes.',
}

/**
 * The same SVG, carrying the values of the properties it names.
 *
 * Pure and separate from the reading, because this is the part that can be
 * silently wrong: a file whose `var()` references resolve to nothing renders as
 * an empty frame, and nothing anywhere fails. `read` hands back the value of one
 * custom property, and a property that comes back empty is left out rather than
 * written as `--accent:`, which would be invalid and take the whole declaration
 * with it.
 */
export function withPalette(svg, palette, read) {
  const vars = [...new Set(Object.values(PALETTES[palette] || {}))]
    .map(name => [name, String(read(name) || '').trim()])
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}:${value}`)
    .join(';')
  return vars ? svg.replace('<svg ', `<svg style="${vars}" `) : svg
}

const svgForFile = (svg, palette) => {
  const root = getComputedStyle(document.documentElement)
  return withPalette(svg, palette, name => root.getPropertyValue(name))
}

export default function SolveArt({ game, analysis }) {
  const [palette, setPalette] = useState('solve')
  const [saved, setSaved] = useState(null)

  // 0.12ms with the analysis in hand against 0.68ms without, so the review's
  // own classification is passed straight through rather than redone.
  const art = useMemo(() => toArt(game, { analysis }), [game, analysis])
  const svg = useMemo(() => (art ? toSvg(art, { palette }) : ''), [art, palette])

  if (!art) {
    return (
      <p className="dataNote">
        Nothing was ever placed in this game, so there is no path to draw. An empty frame would look
        like the feature is broken rather than like the game was.
      </p>
    )
  }

  function save() {
    const file = svgForFile(svg, palette)
    const a = document.createElement('a')
    a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(file)
    a.download = `zsudoku-${new Date(game.endedAt).toISOString().slice(0, 10)}-${game.graded.toLowerCase()}.svg`
    a.click()
    setSaved(`Saved ${Math.round(file.length / 1024)}KB of SVG. It is vector, so it prints at any size.`)
  }

  return (
    <div className="artWrap">
      {/* The renderer returns a string of SVG rather than elements, which is the
          only reason this is set as markup. Every character of it is built here
          from numbers this app computed: there is no user text and no remote
          content anywhere in the path. */}
      <div className="artFrame" dangerouslySetInnerHTML={{ __html: svg }} />

      <p className="artLabel">{art.label}</p>

      <div className="variantRow" role="tablist" aria-label="Palette">
        {PALETTE_NAMES.map(p => (
          <button
            key={p}
            role="tab"
            aria-selected={p === palette}
            className={'variantChip' + (p === palette ? ' on' : '')}
            onClick={() => setPalette(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <p className="dataNote">{PALETTE_ABOUT[palette]}</p>

      <div className="artKey">
        <span><i className="artSwatch earned" /> earned</span>
        <span><i className="artSwatch sharp" /> needed a pattern</span>
        <span><i className="artSwatch lucky" /> unproven</span>
        <span><i className="artSwatch hint" /> hinted</span>
        <span><i className="artSwatch mistake" /> wrong</span>
      </div>

      <p className="dataNote">
        Every bead is one placement, in the order you made them, and its size is how long you sat on
        it: the thread swells where you stalled. The lattice underneath is the grid, the larger faint
        dots are the clues you were given, and the path turns and swells as the game goes on so the
        end is never drawn on top of the beginning.
        {art.stats.autoFilled > 0 &&
          ` The ${art.stats.autoFilled} cells auto-complete took are not here: the thread is a record of attention, and nobody attended to those.`}
      </p>

      {/* Placements and the longest pause are on the facts row at the foot of
          every tab. These two are about the drawing: what a typical bead means
          and what the fattest one does. */}
      <div className="reviewStats">
        <Fact label="Typical dwell" value={`${(art.stats.medianDwellMs / 1000).toFixed(1)}s`} />
        <Fact
          label="Longest"
          value={fmtMs(art.stats.longestDwellMs)}
          sub={art.stats.longestCell >= 0
            ? `r${Math.floor(art.stats.longestCell / 9) + 1}c${(art.stats.longestCell % 9) + 1}`
            : ''}
        />
      </div>

      <div className="dataRow">
        <button className="newBtn" onClick={save}>Save as SVG</button>
      </div>
      {saved && <p className="dataNote notice">{saved}</p>}
    </div>
  )
}

function Fact({ label, value, sub }) {
  return (
    <div className="fact">
      <div className="factValue">{value}</div>
      <div className="factLabel">{label}</div>
      {sub && <div className="factSub">{sub}</div>}
    </div>
  )
}
