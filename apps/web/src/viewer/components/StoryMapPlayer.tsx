/**
 * MightyTwin — Story Map Player
 * Dark bottom panel for guided camera tours.
 */
import { useEffect, useCallback } from 'react'
import { Viewer as CesiumViewerType, Cartesian3, Math as CesiumMath } from 'cesium'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import './StoryMapPlayer.css'

import type { StoryMap, Slide } from '../types/api'
export type { StoryMap, Slide, SlideCamera } from '../types/api'

interface StoryMapPlayerProps {
  storyMap: StoryMap
  currentSlide: number
  onSlideChange: (index: number) => void
  onClose: () => void
  viewer: CesiumViewerType | null
  /** Called when a slide changes to apply its visible_layers config.
   * allLayerIds: all layer ids in the site.
   * visibleIds: ids the slide wants visible (empty = show all). */
  onVisibleLayersChange?: (visibleIds: string[]) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StoryMapPlayer({
  storyMap,
  currentSlide,
  onSlideChange,
  onClose,
  viewer,
  onVisibleLayersChange,
}: StoryMapPlayerProps) {
  const slides = storyMap.slides
  const slide = slides[currentSlide]
  const total = slides.length

  // Fly camera whenever slide changes
  const flyToSlide = useCallback(
    (s: Slide) => {
      if (!viewer) return
      const { longitude, latitude, height, heading = 0, pitch = -45, roll = 0 } = s.camera
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(longitude, latitude, height),
        orientation: {
          heading: CesiumMath.toRadians(heading),
          pitch: CesiumMath.toRadians(pitch),
          roll: CesiumMath.toRadians(roll),
        },
        duration: 2.5,
      })
    },
    [viewer]
  )

  // Apply slide camera + layer visibility on slide change
  useEffect(() => {
    if (!slide) return
    flyToSlide(slide)
    if (onVisibleLayersChange) {
      onVisibleLayersChange(slide.visible_layers ?? [])
    }
  }, [slide, flyToSlide, onVisibleLayersChange])

  const goPrev = () => {
    if (currentSlide > 0) onSlideChange(currentSlide - 1)
  }

  const goNext = () => {
    if (currentSlide < total - 1) onSlideChange(currentSlide + 1)
  }

  if (!slide) return null

  return (
    <div className="story-player">
      {/* Close */}
      <button className="story-player__close" onClick={onClose} title="Close story">
        <X size={18} />
      </button>

      {/* Story title (small) */}
      <div className="story-player__story-name">{storyMap.name}</div>

      {/* Slide content */}
      <div className="story-player__content">
        <h2 className="story-player__slide-title">{slide.title}</h2>
        <p className="story-player__narrative">{slide.narrative}</p>
      </div>

      {/* Navigation */}
      <div className="story-player__nav">
        <button
          className="story-player__nav-btn"
          onClick={goPrev}
          disabled={currentSlide === 0}
          title="Previous slide"
        >
          <ChevronLeft size={20} />
        </button>

        <span className="story-player__counter">
          {currentSlide + 1} / {total}
        </span>

        <button
          className="story-player__nav-btn"
          onClick={goNext}
          disabled={currentSlide === total - 1}
          title="Next slide"
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  )
}
