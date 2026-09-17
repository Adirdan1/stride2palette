/**
 * The mark: an artist's palette.
 *
 * Three tonal layers, per the collection's design language — the board, the
 * glaze of light across it, and the paint. The thumb hole is what makes an oval
 * read as a palette at 32px, so it is a real hole punched with `fill-rule`
 * rather than a dot in the background colour, and it survives any surface the
 * mark is placed on.
 *
 * The three blobs are the app's two ideas in one object: they are the paints on
 * a palette, and they are the layers of a lasagna — ragù, cheese, basil. That is
 * also the whole colour system of the app sitting on its own logo.
 *
 * `clean` is the null condition — no opening date set. The paint is gone and the
 * board drops to the line tokens, so it reads as an unused palette in greyscale
 * before any colour is considered. What disappears is form, not just hue.
 */
export default function Mark({ shut = false, className = '' }) {
  return (
    <svg
      className={`palette ${shut ? 'palette--clean' : ''} ${className}`}
      viewBox="0 0 64 64"
      role="img"
      aria-label={shut ? 'A clean artist’s palette' : 'An artist’s palette with paint on it'}
    >
      {/* The board, with the thumb hole cut out of it. */}
      <path
        className="palette__board"
        fillRule="evenodd"
        d="M8 32a24 20 0 1 0 48 0 24 20 0 1 0-48 0Z
           M25 42a5 5 0 1 0-10 0 5 5 0 1 0 10 0Z"
      />
      {/* The glaze — light falling across the board. */}
      <ellipse className="palette__glaze" cx="21" cy="23" rx="9" ry="4.4" transform="rotate(-24 21 23)" />
      {/* The paint. Ragù, cheese, basil. */}
      <circle className="palette__blob palette__blob--ragu" cx="38" cy="22" r="4.2" />
      <circle className="palette__blob palette__blob--cheese" cx="47" cy="29.5" r="3.8" />
      <circle className="palette__blob palette__blob--basil" cx="41" cy="37.5" r="3.4" />
    </svg>
  );
}
