/**
 * The mark: an artist's palette.
 *
 * Three tonal layers, per the collection's design language — the board, the
 * darker rim along its underside, and the paint.
 *
 * Two things make it read as a palette rather than a blob, and both were
 * arrived at by looking at renders rather than by reasoning:
 *
 *   - **The silhouette needs the waist.** A plain ellipse with dots on it is
 *     clip-art. The concave pinch on the lower right, where the hand goes, is
 *     what the eye recognises, and it survives being shrunk to 30px.
 *   - **The board must be light and the paint vivid.** The first version drew a
 *     dark brown board and used the app's text-safe accents as paint. Those are
 *     dark by construction — they have to clear 4.5:1 on cream — so the dabs sat
 *     at nearly the same value as the board and vanished in greyscale. Paint is
 *     a graphic, not text: it takes the bright values.
 *
 * The four dabs are the four layers of a lasagna — pasta, ragù, cheese, basil.
 *
 * The thumb hole is punched with `fill-rule: evenodd`, so it is a real hole and
 * shows whatever the mark is sitting on. Painted in the page colour it would
 * stop being a hole the moment it was placed on a card.
 *
 * `clean` is the null condition — no opening date. The paint is gone and the
 * board drops to the line tokens, so it reads as an unused palette in greyscale
 * before any colour is considered. What disappears is form, not just hue.
 */

/** Shared by both paths so the rim can never drift away from the board. */
const BOARD = 'M30 6C46.5 6 59 14.8 59 26.4c0 7.7-5 12.4-11.6 14.2-4.4 1.2-6.6 3-7 6.4'
  + '-.6 5.2-6 9.6-13.4 9.6C13.8 56.6 5 45.4 5 31.6 5 16.4 15.6 6 30 6Z'
  + 'M26 43.5a6.6 5.2 0 1 0-13.2 0 6.6 5.2 0 1 0 13.2 0Z';

const RIM = 'M30 6C46.5 6 59 14.8 59 26.4c0 7.7-5 12.4-11.6 14.2-4.4 1.2-6.6 3-7 6.4'
  + '-.6 5.2-6 9.6-13.4 9.6-1.2 0-2.4-.1-3.5-.3 6-.7 10.4-4.6 11-9.2.4-3.4 2.6-5.2 7-6.4'
  + 'C50 43.4 55 38.7 55 31c0-10.6-10.5-19-25.6-19.6C29.6 6 29.8 6 30 6Z';

export default function Mark({ shut = false, className = '' }) {
  return (
    <svg
      className={`palette ${shut ? 'palette--clean' : ''} ${className}`}
      viewBox="0 0 64 64"
      role="img"
      aria-label={shut ? 'A clean artist’s palette' : 'An artist’s palette with paint on it'}
    >
      {/* Tilted, because a palette sitting dead level reads as a plate. */}
      <g transform="rotate(-8 32 32)">
        <path className="palette__board" fillRule="evenodd" d={BOARD} />
        <path className="palette__rim" fillRule="evenodd" d={RIM} />
        <circle className="palette__dab palette__dab--pasta" cx="21.5" cy="18.5" r="4.9" />
        <circle className="palette__dab palette__dab--ragu" cx="33" cy="14.4" r="5.4" />
        <circle className="palette__dab palette__dab--cheese" cx="45" cy="18.4" r="4.6" />
        <circle className="palette__dab palette__dab--basil" cx="52.5" cy="27.5" r="4" />
      </g>
    </svg>
  );
}
