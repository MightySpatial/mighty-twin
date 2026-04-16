import { X, BookOpen } from 'lucide-react'
import type { StoryMap } from '../components/StoryMapPlayer'

interface StoryPickerProps {
  storyMaps: StoryMap[]
  activeStoryMapId: string | undefined
  onSelect: (sm: StoryMap) => void
  onClose: () => void
}

export default function StoryPicker({ storyMaps, activeStoryMapId, onSelect, onClose }: StoryPickerProps) {
  return (
    <>
      <div className="story-picker-backdrop" onClick={onClose} />
      <div className="story-picker">
        <div className="story-picker__header">
          <h3>Stories</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        {storyMaps.map(sm => (
          <button
            key={sm.id}
            className={`story-picker__item ${activeStoryMapId === sm.id ? 'active' : ''}`}
            onClick={() => onSelect(sm)}
          >
            <BookOpen size={16} />
            <span>{sm.name}</span>
            <span className="story-picker__slides">{sm.slides.length} slides</span>
          </button>
        ))}
      </div>
    </>
  )
}
