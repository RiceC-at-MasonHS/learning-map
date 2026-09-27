// Logarithmic zoom slider: maps [0,100] slider range to [0.07, 5] scale.
// Exposes four named zoom levels matching GraphView thresholds.

const ZOOM_MIN = 0.07
const ZOOM_MAX = 5.0

function zoomToSlider(z: number): number {
  return Math.max(0, Math.min(100,
    Math.round(100 * Math.log(z / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)),
  ))
}

function sliderToZoom(s: number): number {
  return ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, s / 100)
}

// Slider positions where each named level begins (logarithmic)
// Overview: zoom 0.07–0.28  → slider  0–32
// Map:      zoom 0.28–0.85  → slider 32–59
// Skills:   zoom 0.85–1.8   → slider 59–80
// Detail:   zoom 1.8–5      → slider 80–100
const LEVELS = [
  { label: 'Overview', min: 0,  max: 32  },
  { label: 'Map',      min: 33, max: 58  },
  { label: 'Skills',   min: 59, max: 79  },
  { label: 'Detail',   min: 80, max: 100 },
]

function currentLevel(slider: number): string {
  return (LEVELS.find(l => slider <= l.max) ?? LEVELS[LEVELS.length - 1]).label
}

interface Props {
  zoom: number
  onZoomTo: (scale: number) => void
}

export function ZoomSlider({ zoom, onZoomTo }: Props) {
  const sliderVal = zoomToSlider(zoom)
  const level     = currentLevel(sliderVal)

  return (
    <div className="zoom-slider-wrap">
      <span className="zoom-level-label">{level}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={sliderVal}
        onChange={e => onZoomTo(sliderToZoom(Number(e.target.value)))}
        className="zoom-slider"
        aria-label="Zoom level"
      />
      <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
    </div>
  )
}
