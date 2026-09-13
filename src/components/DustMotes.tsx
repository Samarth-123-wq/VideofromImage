const MOTES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  size: 1.2 + ((i * 13) % 7) * 0.35,
  delay: -((i * 0.73) % 12),
  duration: 9 + ((i * 5) % 10),
  drift: ((i % 2 === 0 ? 1 : -1) * (12 + (i % 9))) + "px",
  opacity: 0.25 + ((i * 7) % 40) / 100,
}));

export default function DustMotes() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      {MOTES.map((m) => (
        <span
          key={m.id}
          className="dust-mote absolute bottom-[-8%] rounded-full"
          style={
            {
              left: m.left,
              width: m.size,
              height: m.size,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
              opacity: m.opacity,
              "--drift": m.drift,
              background:
                m.id % 3 === 0
                  ? "radial-gradient(circle, rgba(255,220,150,0.95) 0%, rgba(255,170,60,0) 70%)"
                  : "radial-gradient(circle, rgba(255,236,200,0.9) 0%, rgba(255,180,80,0) 70%)",
              boxShadow: "0 0 6px 1px rgba(255,190,90,0.35)",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
