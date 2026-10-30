/**
 * What Resources is about, in the order the filters show it — antislop's own
 * eight topics, plus Writing.
 */
export const TOPICS = [
  "Mindset",
  "Worldview",
  "Career",
  "Greatness",
  "Creativity",
  "Writing",
  "Thinking",
  "Learning",
  "Productivity",
] as const;

export type Topic = (typeof TOPICS)[number];
