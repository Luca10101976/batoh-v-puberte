export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <section className="glass-card w-full p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-coral">Offline režim</p>
        <h1 className="mt-3 text-2xl font-bold">Teď jsi bez internetu</h1>
        <p className="mt-3 text-sm leading-6 text-mist">
          Až se vrátí připojení, hra se zase normálně načte. Klidně se vrať zpět a zkus to za chvíli.
        </p>
      </section>
    </main>
  );
}
