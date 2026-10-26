/** The six-dot grab handle. Spread a useDraggable().grip onto it. */
export default function DragHandle(grip) {
  return (
    <button className="bar-grip" {...grip} title="Drag to move this bar">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {[8, 12, 16].map((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
      </svg>
    </button>
  );
}
