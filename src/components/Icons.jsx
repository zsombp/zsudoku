// The ten icons the app uses, inlined.
//
// The prototype pulled these from lucide-react. Inlining drops a dependency
// from a project whose whole point is low maintenance and zero third-party
// anything, and ten paths is not a burden. Drawn in the lucide style: 24x24
// box, 2px stroke, round caps and joins, no fill.

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

const Svg = ({ size = 20, children, ...rest }) => (
  <svg {...base} width={size} height={size} {...rest}>{children}</svg>
)

export const Undo = props => (
  <Svg {...props}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
)

export const Eraser = props => (
  <Svg {...props}>
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </Svg>
)

export const Pencil = props => (
  <Svg {...props}>
    <path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z" />
    <path d="m15 5 4 4" />
  </Svg>
)

export const Sparkles = props => (
  <Svg {...props}>
    <path d="M12 3.5 13.6 9a2 2 0 0 0 1.4 1.4l5.5 1.6-5.5 1.6a2 2 0 0 0-1.4 1.4L12 20.5 10.4 15a2 2 0 0 0-1.4-1.4L3.5 12 9 10.4A2 2 0 0 0 10.4 9z" />
    <path d="M19 3v3" />
    <path d="M20.5 4.5h-3" />
    <path d="M5 17v2" />
    <path d="M6 18H4" />
  </Svg>
)

export const Pause = props => (
  <Svg {...props}>
    <rect x="14" y="4" width="4" height="16" rx="1" />
    <rect x="6" y="4" width="4" height="16" rx="1" />
  </Svg>
)

export const Play = props => (
  <Svg {...props}>
    <path d="M6 3.5 20 12 6 20.5z" />
  </Svg>
)

export const Moon = props => (
  <Svg {...props}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Svg>
)

export const Sun = props => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </Svg>
)

export const Plus = props => (
  <Svg {...props}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Svg>
)

export const Trophy = props => (
  <Svg {...props}>
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22" />
    <path d="M14 14.7V17c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </Svg>
)
