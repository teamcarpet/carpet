import { Hero } from "@/components/Hero";
import { Navbar } from "@/components/Navbar";
import { SectionTitle } from "@/components/SectionTitle";
import { StepCard } from "@/components/StepCard";
import { TaskCard } from "@/components/TaskCard";
import { liveTasks, ongoingTasks } from "@/data/tasks";

const steps = [
  {
    step: "01",
    title: "Browse Tasks",
    description: "Find simple tasks that match your skills, audience, or time.",
  },
  {
    step: "02",
    title: "Join Task",
    description: "Pick a task, review the reward, and commit your effort.",
  },
  {
    step: "03",
    title: "Submit Proof",
    description: "Share proof of completion and track your earned reward.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-time-background">
      <Navbar />
      <Hero />

      <section className="mx-auto max-w-6xl px-6 py-12">
        <SectionTitle
          eyebrow="How it works"
          title="Simple tasks, clear rewards"
          description="Time keeps the flow direct: browse, join, complete, and submit proof."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <StepCard key={step.step} {...step} />
          ))}
        </div>
      </section>

      <section id="live-tasks" className="mx-auto max-w-6xl px-6 py-12">
        <SectionTitle
          title="Live Tasks"
          description="Preview available opportunities and the rewards attached to each one."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {liveTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <SectionTitle
          title="Ongoing Tasks"
          description="A quick look at tasks already joined by the community."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {ongoingTasks.map((task) => (
            <article
              key={task.id}
              className="rounded-xl border border-time-border bg-time-card p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {task.title}
                  </h3>
                  <p className="mt-3 text-sm font-semibold text-time-green">
                    {task.reward} TIME
                  </p>
                </div>
                <span className="rounded-full border border-time-green/30 bg-time-green/10 px-3 py-1 text-xs font-semibold text-time-green">
                  Joined
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mt-12 border-t border-time-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-bold tracking-[0.12em] text-white">Time</p>
          <p className="text-sm text-time-muted">Turn your time into value.</p>
        </div>
      </footer>
    </main>
  );
}
