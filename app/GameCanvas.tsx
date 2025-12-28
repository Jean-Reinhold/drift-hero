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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const telemetryRef = useRef(onTelemetry);
  const initialConfigRef = useRef(trackConfig);

  useEffect(() => {
    telemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = createEngine(canvas, initialConfigRef.current, (data) => {
      telemetryRef.current(data);
    });
    engineRef.current = engine;

    return () => {
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateTrack(trackConfig);
  }, [trackConfig]);

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      role="img"
      aria-label="Drift Hero track and car"
    />
  );
}
