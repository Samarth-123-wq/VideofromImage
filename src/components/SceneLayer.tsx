import { useEffect, useState } from "react";
import type { Scene } from "../reel/scenes";

export default function SceneLayer({
  scene,
  active,
}: {
  scene: Scene;
  active: boolean;
}) {
  const [pose, setPose] = useState<"from" | "to">("from");

  useEffect(() => {
    if (!active) return;
    setPose("from");
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPose("to"));
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  const k = pose === "to" ? scene.to : scene.from;

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: active ? 1 : 0,
        transition: "opacity 380ms ease-out",
        pointerEvents: "none",
      }}
    >
      <img
        src={scene.src}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          transform: `scale(${k.scale}) translate(${k.x}%, ${k.y}%)`,
          transition:
            pose === "to" && active
              ? `transform ${scene.hold + 220}ms linear`
              : "none",
          filter:
            scene.grade === "interior"
              ? "saturate(1.05) contrast(1.12) sepia(0.18) brightness(1.02)"
              : scene.grade === "gold"
                ? "saturate(1.12) contrast(1.1) sepia(0.16) brightness(1.04)"
                : "saturate(1.08) contrast(1.08) sepia(0.14) brightness(1.03)",
          transformOrigin: "center center",
          willChange: "transform, opacity",
        }}
      />
    </div>
  );
}
