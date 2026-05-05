import type { Task } from "@/data/tasks";

type TaskCardProps = {
  task: Task;
};

export function TaskCard({ task }: TaskCardProps) {
  return (
    <article className="rounded-xl border border-time-border bg-time-card p-5 transition duration-200 hover:-translate-y-1 hover:border-blue-500/70">
      <div className="flex h-full flex-col">
        <div>
          <h3 className="text-lg font-semibold text-white">{task.title}</h3>
          <p className="mt-3 text-sm leading-6 text-time-muted">
            {task.description}
          </p>
        </div>
        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-time-green">
            {task.reward} TIME
          </p>
          <button className="rounded-xl border border-time-border px-4 py-2 text-sm font-semibold text-white transition hover:border-time-green hover:text-time-green">
            Join
          </button>
        </div>
      </div>
    </article>
  );
}
