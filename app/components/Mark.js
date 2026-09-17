/**
 * The mark: a threshold.
 *
 * Three tonal layers, per the collection's design language — the light of the
 * room beyond, the leaf of the door standing ajar, and the frame around both.
 * Each layer is a different tone of the same idea rather than a different hue,
 * so it holds together at 32px and in greyscale.
 *
 * The leaf breathes on a 9s loop and the light on a 6.5s one, so the two never
 * look synchronised. Both sit inside a reduced-motion guard in globals.css.
 *
 * `shut` is the app's null condition — no opening date is set. The leaf closes
 * over the light entirely and everything drops to the line tokens. The state
 * differs in *form* first: what disappears is the gap, so it reads as shut with
 * the colour taken away.
 */
export default function Mark({ shut = false, className = '' }) {
  return (
    <svg
      className={`door ${shut ? 'door--shut' : ''} ${className}`}
      viewBox="0 0 64 64"
      role="img"
      aria-label={shut ? 'A closed door' : 'A door standing open'}
    >
      {/* The room beyond — drawn first so the leaf covers most of it. */}
      <path className="door__light" d="M14 58 L14 28 A18 18 0 0 1 50 28 L50 58 Z" />
      {/* The leaf, hinged on the left at x=14. */}
      <path className="door__leaf" d="M14 28 L43 28 L43 58 L14 58 Z" />
      {/* The frame, on top of both. */}
      <path className="door__frame" d="M12 58 L12 26 A20 20 0 0 1 52 26 L52 58" />
    </svg>
  );
}
