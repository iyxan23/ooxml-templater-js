import React from "react";
import { useDocxTemplater } from "./useDocxTemplater";

const ANIMATION_DURATION = 1000;

export default function Pipe({ which }: { which: "left" | "right" }) {
  const movingAnimRef = React.useRef<Animation | null>(null);
  const movingRef = React.useRef<SVGPathElement | null>(null);

  const firstLineRef = React.useRef<SVGPathElement | null>(null);
  const secondLineRef = React.useRef<SVGPathElement | null>(null);

  const isPending = useDocxTemplater((state) => state.isPending);

  React.useEffect(() => {
    const ref = movingRef.current;
    if (ref === null) return;
    if (movingAnimRef.current !== null) return;

    movingAnimRef.current = ref.animate(
      {
        strokeDashoffset: [
          which === "right" ? 1000 : -1000,
          which === "right" ? -1000 : 1000,
        ],
      },
      {
        duration: 50000,
        iterations: Infinity,
      },
    );
  });

  React.useEffect(() => {
    if (!isPending) return;

    const secondLine = secondLineRef.current;
    const firstLine = firstLineRef.current;
    if (firstLine === null || secondLine === null) return;

    const animation = firstLine.animate(
      {
        strokeDashoffset: [
          which === "right" ? 1000 : -1000,
          which === "right" ? -1000 : 1000,
        ],
      },
      {
        duration: ANIMATION_DURATION,
        delay: which === "right" ? ANIMATION_DURATION * 0.8 : 0,
      },
    );

    console.log(animation);

    secondLine.animate(
      {
        strokeDashoffset: [
          which === "right" ? 1000 : -1000,
          which === "right" ? -1000 : 1000,
        ],
      },
      {
        duration: ANIMATION_DURATION,
        delay: which === "right" ? ANIMATION_DURATION * 0.8 : 0,
      },
    );
  }, [isPending]);

  return (
    <div
      className="overflow-hidden"
      style={{ transform: which === "left" ? "scale(-1, 1)" : undefined }}
    >
      <svg viewBox="0 0 100 100" width="50%" height="100%" overflow="visible">
        <path
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeOpacity={0.2}
          strokeWidth={3}
          id="bg"
          d="M 0 100 L 90 100 A 10 10 90 0 0 100 90 L 100 -1000"
        />

        <path
          fill="none"
          stroke="hsl(var(--primary))"
          strokeDasharray="50 100"
          strokeWidth={3}
          strokeOpacity={0.3}
          style={{
            animation: "move 2s ease-in-out infinite",
          }}
          filter="url(#f1)"
          id="moving"
          d="M 0 100 L 90 100 A 10 10 90 0 0 100 90 L 100 -1000"
          ref={movingRef}
        />

        <path
          fill="none"
          stroke="#00f"
          strokeWidth={3}
          style={{
            strokeDasharray: 1000,
            strokeDashoffset: which === "right" ? 1000 : -1000,
          }}
          filter="url(#f2)"
          d="M 0 100 L 90 100 A 10 10 90 0 0 100 90 L 100 -1000"
          ref={secondLineRef}
        />

        <path
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth={3}
          style={{
            strokeDasharray: 1000,
            strokeDashoffset: which === "right" ? 1000 : -1000,
          }}
          d="M 0 100 L 90 100 A 10 10 90 0 0 100 90 L 100 -1000"
          ref={firstLineRef}
        />

        <defs>
          <filter id="f1" x="0" y="0" xmlns="http://www.w3.org/2000/svg">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
          </filter>
          <filter id="f2" x="0" y="0" xmlns="http://www.w3.org/2000/svg">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
