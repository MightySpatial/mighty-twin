# Measure

Distance and area, on the globe.

Measure is the simplest way to answer the question "how far apart are two
points?" or "how much ground does this area cover?" Click once to start, again
to place each point, double-click to finish.

## Controls

1. **Start measuring.** Arms the tool. Your pointer now drops points on the globe.
2. **Click** anywhere on the globe to place a point. The running distance updates with each click.
3. **Double-click** to finish. A result panel appears with distance, area (if ≥ 3 points), and the point count.
4. **Esc** or **Cancel** drops the measurement without saving.
5. **Clear** on the result panel removes everything and returns to the start state.

## States

- **Idle** — only the "Start measuring" button is visible.
- **Active** — a hint tooltip tells you to click. Each placed point is an indigo dot on the ground, with a live polyline following your cursor.
- **Running** — once you have one or more points, the tooltip shows the running distance, point count, and "double-click to finish."
- **Finished** — the polyline is made static. With three or more points, a translucent polygon fill appears. The result panel pops up.

> **Tip.** You can kick off a new measurement without clearing the current
> result — the old entities stay on the globe until you hit Clear.

## Units

- **Distance** — metres under 1 km, otherwise kilometres to two decimal places.
- **Area** — square metres under 1 ha, hectares under 1 km², square kilometres above.

## What Measure is not (yet)

- Saving measurements to a site — v1 is ephemeral.
- Editing an existing measurement by dragging points.
- Terrain-aware measurement (along a hill, over a building).
- Imperial or nautical units.

**Spec version:** 1 · **Implementation version:** 0.1.0
