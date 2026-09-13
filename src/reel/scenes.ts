export type Ken = {
  scale: number;
  x: number;
  y: number;
};

export type Scene = {
  id: string;
  src: string;
  hold: number;
  from: Ken;
  to: Ken;
  grade?: "warm" | "interior" | "gold";
  flicker?: boolean;
};

export const LOOP_MS = 10_000;

export const SCENES: Scene[] = [
  {
    id: "sunset",
    src: "/images/scene-10-sunset.jpg",
    hold: 1050,
    from: { scale: 1.04, x: 0, y: 2 },
    to: { scale: 1.18, x: 0, y: -3 },
    grade: "gold",
  },
  {
    id: "school",
    src: "/images/scene-01-school.jpg",
    hold: 1150,
    from: { scale: 1.1, x: -4, y: 1 },
    to: { scale: 1.18, x: 3, y: -1 },
    grade: "warm",
  },
  {
    id: "bag",
    src: "/images/scene-09-bag.jpg",
    hold: 950,
    from: { scale: 1.06, x: 2, y: 2 },
    to: { scale: 1.2, x: -1, y: -2 },
    grade: "warm",
  },
  {
    id: "cricket",
    src: "/images/scene-03-cricket.jpg",
    hold: 1450,
    from: { scale: 1.08, x: 3, y: 1 },
    to: { scale: 1.22, x: -2, y: -2 },
    grade: "gold",
  },
  {
    id: "wicket",
    src: "/images/scene-08-wicket.jpg",
    hold: 750,
    from: { scale: 1.02, x: 0, y: 3 },
    to: { scale: 1.24, x: 0, y: -2 },
    grade: "warm",
  },
  {
    id: "snacks",
    src: "/images/scene-04-snacks.jpg",
    hold: 1050,
    from: { scale: 1.1, x: -2, y: 1 },
    to: { scale: 1.16, x: 2, y: -1 },
    grade: "warm",
  },
  {
    id: "tv",
    src: "/images/scene-05-tv.jpg",
    hold: 950,
    from: { scale: 1.05, x: 0, y: 0 },
    to: { scale: 1.12, x: 0, y: -1 },
    grade: "interior",
    flicker: true,
  },
  {
    id: "mother",
    src: "/images/scene-06-mother.jpg",
    hold: 1050,
    from: { scale: 1.08, x: 1, y: 2 },
    to: { scale: 1.2, x: -1, y: -3 },
    grade: "gold",
  },
  {
    id: "running",
    src: "/images/scene-07-running.jpg",
    hold: 1300,
    from: { scale: 1.16, x: 4, y: 1 },
    to: { scale: 1.06, x: -3, y: -1 },
    grade: "gold",
  },
];

export const SCENE_STARTS: number[] = (() => {
  const starts: number[] = [];
  let acc = 0;
  for (const s of SCENES) {
    starts.push(acc);
    acc += s.hold;
  }
  return starts;
})();
