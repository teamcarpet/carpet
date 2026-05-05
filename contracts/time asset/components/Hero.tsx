export function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <div className="max-w-3xl">
        <p className="mb-5 inline-flex rounded-full border border-time-border bg-time-card px-4 py-2 text-sm font-medium text-time-muted">
          Time Assets
        </p>
        <h1 className="text-5xl font-bold leading-tight text-white sm:text-6xl lg:text-7xl">
          Turn Your Time Into{" "}
          <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
            Rewards
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-time-muted sm:text-xl">
          Join tasks, complete them, and earn rewards for your effort.
        </p>
        <div className="mt-8">
          <a
            href="#live-tasks"
            className="inline-flex rounded-xl bg-gradient-to-r from-purple-600 to-blue-500 px-6 py-3 text-base font-semibold text-white transition hover:opacity-90"
          >
            Get Started
          </a>
        </div>
      </div>
    </section>
  );
}
