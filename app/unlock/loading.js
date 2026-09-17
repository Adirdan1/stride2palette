export default function Loading() {
  return (
    <main className="unlock" aria-busy="true">
      <div className="skeleton unlock__mark" style={{ borderRadius: '12px' }} />
      <div className="skeleton" style={{ height: '2rem', margin: '0 auto 1.5rem', width: '8rem' }} />
      <div className="skeleton" style={{ height: '3rem', marginBottom: '0.85rem' }} />
      <div className="skeleton" style={{ height: '3rem', marginBottom: '0.85rem' }} />
      <div className="skeleton" style={{ height: '2.75rem', borderRadius: '999px' }} />
    </main>
  );
}
