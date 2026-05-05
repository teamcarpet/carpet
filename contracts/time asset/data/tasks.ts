export type Task = {
  id: number;
  title: string;
  description: string;
  reward: number;
};

export const liveTasks: Task[] = [
  {
    id: 1,
    title: "Post on Twitter",
    description: "Share a short post about Time and tag the project.",
    reward: 25,
  },
  {
    id: 2,
    title: "Join Telegram",
    description: "Join the community channel and introduce yourself.",
    reward: 15,
  },
  {
    id: 3,
    title: "Design a logo",
    description: "Create a clean concept mark for a featured campaign.",
    reward: 120,
  },
  {
    id: 4,
    title: "Write a thread",
    description: "Publish a useful thread explaining time-based rewards.",
    reward: 80,
  },
  {
    id: 5,
    title: "Share feedback",
    description: "Review the landing page and submit product notes.",
    reward: 35,
  },
  {
    id: 6,
    title: "Invite a friend",
    description: "Bring one new member into the Time community.",
    reward: 20,
  },
];

export const ongoingTasks: Task[] = [
  liveTasks[0],
  liveTasks[3],
  liveTasks[4],
];
