"use client";

import { useEffect, useRef } from "react";
import { createEngine } from "@/lib/game/engine";
import type { Telemetry } from "@/lib/game/engine";
import type { TrackConfig } from "@/lib/game/track";

type GameCanvasProps = {
  trackConfig: TrackConfig;
  onTelemetry: (telemetry: Telemetry) => void;
};

export default function GameCanvas({
  trackConfig,
  onTelemetry
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const telemetryRef = useRef(onTelemetry);
  const initialConfigRef = useRef(trackConfig);

  useEffect(() => {
    telemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = createEngine(
      container,
      initialConfigRef.current,
      (data) => {
        telemetryRef.current(data);
      },
      {
        renderer: "pixi",
        useWorker: true,
        renderFps: 60,
        maxDpr: 0.85,
        quality: { environment: "low" }
      }
    );
    engineRef.current = engine;

    return () => {
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateTrack(trackConfig);
  }, [trackConfig]);

  return (
    <div
      ref={containerRef}
      className="game-canvas"
      role="img"
      aria-label="Drift Hero track and car"
    />
  );
}
