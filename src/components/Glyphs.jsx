/**
 * One small drawn mark per rung of the ladder.
 *
 * The practice list, the due card, today's session, a lesson and a drill all
 * name a pattern, and until now they named it in words only: twenty rows of
 * text that read the same at a glance. A glyph is the pattern's shape reduced to
 * what survives at 20px, so the rows are told apart before they are read.
 *
 * The marks are drawn as families, because the patterns are. The naked sets are
 * bare cells with a note in each, the hidden sets the same cells filled solid,
 * as the cells a set of digits has claimed, and the count of cells is the size
 * of the set. Rings, then a light shade, were tried for the hidden sets first,
 * and neither could be told from a dot inside a six-pixel cell. The fish are their rows and corners. The wings are a pivot and its
 * pincers, the chains their links, and the cage rungs wear the dashed outline a
 * cage has on the board.
 *
 * The same rules as Emblems.jsx: `currentColor` and `--panel` only, round caps
 * and joins, so a glyph takes whichever theme is on and can never disagree with
 * the label beside it. Static: nothing here animates.
 */

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

const Dot = ({ x, y, r = 1.5 }) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />
const Ring = ({ x, y, r = 1.9 }) => <circle cx={x} cy={y} r={r} />
const Cross = ({ x, y, r = 1.6 }) => <path d={`M${x - r} ${y - r}l${2 * r} ${2 * r}M${x + r} ${y - r}l${-2 * r} ${2 * r}`} />
const CAGE = { strokeDasharray: '2.2 2' }

/** Cells in a row (or a square), each holding a note; shaded when hidden. */
const set = (positions, s, hidden) => (
  <>
    {positions.map(([x, y], i) => (
      <g key={i}>
        <rect x={x} y={y} width={s} height={s} rx="1.4" {...(hidden ? { fill: 'currentColor' } : {})} />
        {hidden ? (
          <circle cx={x + s / 2} cy={y + s / 2} r={1.3} fill="var(--panel)" stroke="none" />
        ) : (
          <Dot x={x + s / 2} y={y + s / 2} />
        )}
      </g>
    ))}
  </>
)

const PAIR = [[3, 8.5], [13.5, 8.5]]
const TRIPLE = [[2, 9], [9, 9], [16, 9]]
const QUAD = [[3.5, 3.5], [13, 3.5], [3.5, 13], [13, 13]]

const GLYPHS = {
  // One cell, one note left in it.
  nakedSingle: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <Dot x={12} y={12} r={2} />
    </>
  ),
  // A box with one place left for the digit.
  hiddenSingle: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" strokeOpacity="0.45" />
      <rect x="15.6" y="4.3" width="4.1" height="4.1" rx="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  // Both homes in the box sit on one line, so the line beyond loses the digit.
  pointing: (
    <>
      <rect x="3" y="3" width="11" height="11" rx="2" />
      <Dot x={6.4} y={8.5} />
      <Dot x={10.6} y={8.5} />
      <path d="M14 8.5h7M18.5 6.2l2.5 2.3-2.5 2.3" />
    </>
  ),
  // The line's homes all sit in one box, so the rest of the box loses it.
  claiming: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M2 12h20" />
      <Dot x={10} y={12} />
      <Dot x={14} y={12} />
    </>
  ),
  nakedPair: set(PAIR, 7.5, false),
  hiddenPair: set(PAIR, 7.5, true),
  nakedTriple: set(TRIPLE, 6, false),
  hiddenTriple: set(TRIPLE, 6, true),
  nakedQuad: set(QUAD, 7.5, false),
  // Two rows, two columns, four corners.
  xWing: (
    <>
      <path d="M5 6h14M5 18h14" strokeOpacity="0.45" />
      <path d="M5 6l14 12M19 6L5 18" />
      <Dot x={5} y={6} r={1.8} />
      <Dot x={19} y={6} r={1.8} />
      <Dot x={5} y={18} r={1.8} />
      <Dot x={19} y={18} r={1.8} />
    </>
  ),
  // Three rows, their homes across three columns, not every one filled.
  swordfish: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" strokeOpacity="0.45" />
      <path d="M5 5v14M12 5v7M19 12v7" />
      <Dot x={5} y={5} />
      <Dot x={12} y={5} />
      <Dot x={12} y={12} />
      <Dot x={19} y={12} />
      <Dot x={5} y={19} />
      <Dot x={19} y={19} />
    </>
  ),
  // A pivot and two pincers; what sees both pincers loses the digit.
  xyWing: (
    <>
      <path d="M12 5.5L5 18M12 5.5L19 18" />
      <Dot x={12} y={5.5} r={2.1} />
      <Ring x={5} y={18} />
      <Ring x={19} y={18} />
      <Cross x={12} y={18} r={1.5} />
    </>
  ),
  // Two towers on one floor: the bases share a line, the roofs see a target.
  skyscraper: (
    <>
      <rect x="4" y="4" width="5.5" height="16" rx="1" />
      <rect x="14.5" y="9.5" width="5.5" height="10.5" rx="1" />
      <path d="M2.5 20h19" />
      <Dot x={6.75} y={7} r={1.3} />
      <Dot x={17.25} y={12.5} r={1.3} />
    </>
  ),
  // A row link and a column link joined in one box.
  twoStringKite: (
    <>
      <path d="M12 3l7 7.5L12 21l-7-10.5z" />
      <path d="M5 10.5h14M12 3v18" strokeOpacity="0.45" />
      <Dot x={12} y={3} />
      <Dot x={19} y={10.5} />
      <Dot x={5} y={10.5} />
    </>
  ),
  // Two matching wings and the strong link that bridges them.
  wWing: (
    <>
      <path d="M3 6l4.5 12L12 9l4.5 9L21 6" />
      <Ring x={3} y={6} />
      <Ring x={21} y={6} />
      <Dot x={7.5} y={18} />
      <Dot x={16.5} y={18} />
    </>
  ),
  // The XY-Wing whose pivot holds the digit too, so the target must see it.
  xyzWing: (
    <>
      <path d="M12 5.5L5 18M12 5.5L19 18" />
      <path d="M12 8v7.5" strokeDasharray="1.6 1.8" />
      <Dot x={12} y={5.5} r={2.1} />
      <Ring x={5} y={18} />
      <Ring x={19} y={18} />
      <Cross x={12} y={18.5} r={1.4} />
    </>
  ),
  // The cage rungs: the dashed outline a cage wears on the board.
  cageCombo: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" {...CAGE} />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  cageSum: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" {...CAGE} />
      <Dot x={9} y={12} />
      <Dot x={15} y={12} />
    </>
  ),
  cageSingle: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2.5" {...CAGE} />
      <Dot x={12} y={12} r={2} />
    </>
  ),
  // The 45 rule: a box's total, and the one cell left over outside it.
  sum45: (
    <>
      <rect x="3" y="3" width="13" height="13" rx="2" {...CAGE} />
      <rect x="15.5" y="15.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  // A cage whose homes for a digit all sit on one line.
  cageLocked: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2.5" {...CAGE} />
      <path d="M1.5 12h21" />
    </>
  ),
}

export const GLYPH_IDS = Object.keys(GLYPHS)

/** The rung's mark, or nothing at all for a key it has not been taught. */
export function TechGlyph({ technique, size = 20, width = 1.5, className = 'techGlyph', ...rest }) {
  const art = GLYPHS[technique]
  if (!art) return null
  return (
    <svg {...base} width={size} height={size} strokeWidth={width} className={className} {...rest}>
      {art}
    </svg>
  )
}
