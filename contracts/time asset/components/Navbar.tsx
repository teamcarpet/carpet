export function Navbar() {
  return (
    <header className="border-b border-time-border/70">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a
          href="#top"
          className="text-xl font-bold tracking-[0.12em] text-white"
          aria-label="Time home"
        >
          Time
        </a>
        <button className="rounded-xl border border-time-border bg-time-card px-4 py-2 text-sm font-semibold text-white transition hover:border-blue-500/70">
          Connect Wallet
        </button>
      </nav>
    </header>
  );
}
