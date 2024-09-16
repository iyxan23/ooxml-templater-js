import React from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

export function Component() {
  const [yes, setYes] = React.useState(false);

  return (
    <div className="w-full min-h-screen flex flex-col items-center">
      <main className="container p-6">
        <section className="grid grid-cols-2 gap-6">
          <article className="p-4 rounded-md border border-foreground/10 flex flex-col gap-2 items-center">
            <Label>Input file</Label>
          </article>
          <article className="p-4 rounded-md border border-foreground/10 flex flex-col gap-2 items-center">
            <Label>Output file</Label>
          </article>
        </section>
        <section className="grid grid-cols-[20%_1fr_20%]">
          <div
            className="overflow-hidden"
            style={{ transform: "scale(-1, 1)" }}
          >
            <svg
              viewBox="0 0 100 100"
              width="50%"
              height="100%"
              overflow="visible"
            >
              <path
                fill="none"
                stroke="hsl(var(--foreground))"
                strokeWidth={3}
                style={{
                  strokeDasharray: 1000,
                  strokeDashoffset: yes ? 1000 : -1000,
                  transitionProperty: "stroke-dashoffset, stroke-dasharray",
                  transition: "2s ease-in",
                }}
                d="M 0 100 L 90 100 A 10 10 90 0 0 100 90 L 100 -1000"
              />
              <path
                fill="none"
                stroke="hsl(var(--foreground))"
                strokeOpacity={0.2}
                strokeWidth={3}
                d="M 0 100 L 90 100 A 10 10 90 0 0 100 90 L 100 -1000"
              />
            </svg>
          </div>
          <div className="w-full rounded-md border border-foreground/10 p-4 flex flex-col gap-4 mt-6">
            <Label>Input JSON</Label>
            <Textarea className="font-mono" rows={15}></Textarea>
            <Button onClick={() => setYes(!yes)}>Template</Button>
          </div>
          <div className="overflow-hidden">
            <svg
              viewBox="0 0 100 100"
              width="50%"
              height="100%"
              overflow="visible"
            >
              <path
                fill="none"
                stroke="hsl(var(--foreground))"
                strokeWidth={3}
                style={{
                  strokeDasharray: 1000,
                  strokeDashoffset: yes ? -1000 : 1000,
                  transitionProperty: "stroke-dashoffset, stroke-dasharray",
                  transition: "2s ease-out",
                  transitionDelay: "2s",
                }}
                d="M 0 100 L 90 100 A 10 10 90 0 0 100 90 L 100 -1000"
              />
              <path
                fill="none"
                stroke="hsl(var(--foreground))"
                strokeOpacity={0.2}
                strokeWidth={3}
                d="M 0 100 L 90 100 A 10 10 90 0 0 100 90 L 100 -1000"
              />
            </svg>
          </div>
        </section>
      </main>
    </div>
  );
}
