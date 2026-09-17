/** A skeleton shaped like the real content, so the page does not jump. */
export default function Loading() {
  return (
    <main className="shell" aria-busy="true">
      <div className="topbar">
        <div className="skeleton" style={{ width: '6rem', height: '1.4rem' }} />
        <div className="skeleton" style={{ width: '4rem', height: '2.75rem', borderRadius: '999px' }} />
      </div>
      <div className="skeleton" style={{ height: '13rem', borderRadius: '20px' }} />
      <div className="band">
        <div className="skeleton" style={{ width: '4rem', height: '0.8rem', marginBottom: '0.6rem' }} />
        <div className="band__list">
          <div className="skeleton" style={{ height: '4rem' }} />
          <div className="skeleton" style={{ height: '4rem' }} />
          <div className="skeleton" style={{ height: '4rem' }} />
        </div>
      </div>
    </main>
  );
}
