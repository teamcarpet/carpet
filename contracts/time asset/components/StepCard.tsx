type StepCardProps = {
  step: string;
  title: string;
  description: string;
};

export function StepCard({ step, title, description }: StepCardProps) {
  return (
    <article className="rounded-xl border border-time-border bg-time-card p-6">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-blue-500 text-sm font-bold text-white">
        {step}
      </div>
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-time-muted">{description}</p>
    </article>
  );
}
