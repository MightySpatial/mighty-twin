/** Ellipse tool — 3-click. The user picks centre, then major-axis end,
 *  then a width offset. The Parameters panel shows the resolved values
 *  for review; auto-commit fires on the third click. */
import { useDraftParams, num } from './_helpers'

export default function EllipseParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params } = useDraftParams(draftNodeId)
  return (
    <div className="ep-readout">
      <div className="ep-row"><span>Major axis</span><b>{num(params, 'majorAxis', 0).toFixed(2)} m</b></div>
      <div className="ep-row"><span>Minor axis</span><b>{num(params, 'minorAxis', 0).toFixed(2)} m</b></div>
      <div className="ep-row"><span>Heading</span><b>{num(params, 'heading', 0).toFixed(1)}°</b></div>
    </div>
  )
}
