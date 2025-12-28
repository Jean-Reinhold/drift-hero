"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameCanvas from "./GameCanvas";
import type { Telemetry } from "@/lib/game/engine";
import { createTrackConfig, randomSeed } from "@/lib/game/config";

const YT_API_SRC = "https://www.youtube.com/iframe_api";
const YT_PLAYER_ID = "drift-yt-player";
const YT_VIDEO_ID = "6Qm7pHtPNmc";
const YT_PLAYLIST_ID = "PL4pY4oVuh2lH8UlBMWK4pYUDwUcq5X4LN";

type YouTubePlayer = {
  playVideo: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
  getIframe: () => HTMLIFrameElement;
};

type YouTubeGlobal = {
  Player: new (
    id: string,
    options: {
      width?: number | string;
      height?: number | string;
      videoId?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (event: { target: YouTubePlayer }) => void;
      };
    }
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const formatScore = (score: number) => Math.floor(score).toLocaleString("en-US");

export default function GameShell() {
  const [telemetry, setTelemetry] = useState<Telemetry>({
    speed: 0,
    driftAngle: 0,
    score: 0,
    multiplier: 1,
    combo: 0,
    onTrack: true
  });

  const trackConfig = useMemo(() => createTrackConfig(randomSeed()), []);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const hasUnmutedRef = useRef(false);

  const handleTelemetry = useCallback((next: Telemetry) => {
    setTelemetry(next);
  }, []);

  useEffect(() => {
    let isActive = true;

    const handleReady = (event: { target: YouTubePlayer }) => {
      const iframe = event.target.getIframe?.();
      if (iframe) {
        iframe.setAttribute("title", "Drift Hero playlist");
        iframe.setAttribute(
          "allow",
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        );
        iframe.setAttribute("allowfullscreen", "true");
      }
      event.target.unMute();
      event.target.playVideo();
    };

    const initPlayer = () => {
      if (!isActive || playerRef.current || !window.YT?.Player) {
        return;
      }

      playerRef.current = new window.YT.Player(YT_PLAYER_ID, {
        width: "100%",
        height: "110",
        videoId: YT_VIDEO_ID,
        playerVars: {
          autoplay: 1,
          mute: 0,
          playsinline: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          listType: "playlist",
          list: YT_PLAYLIST_ID,
          origin: window.location.origin
        },
        events: {
          onReady: handleReady
        }
      });
    };

    const ensureApi = () => {
      if (window.YT?.Player) {
        initPlayer();
        return;
      }

      const existingScript = document.querySelector(
        `script[src="${YT_API_SRC}"]`
      );

      if (!existingScript) {
        const script = document.createElement("script");
        script.src = YT_API_SRC;
        script.async = true;
        document.body.appendChild(script);
      }

      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        initPlayer();
      };
    };

    ensureApi();

    return () => {
      isActive = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleInteraction = () => {
      if (hasUnmutedRef.current) {
        return;
      }

      const player = playerRef.current;
      if (!player) {
        return;
      }

      player.unMute();
      player.playVideo();
      hasUnmutedRef.current = true;
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };

    window.addEventListener("pointerdown", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);

    return () => {
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, []);

  const speed = Math.round(telemetry.speed);
  const driftDegrees = Math.round(
    Math.abs(telemetry.driftAngle) * (180 / Math.PI)
  );

  return (
    <main className="game-shell">
      <section className="stage">
        <GameCanvas trackConfig={trackConfig} onTelemetry={handleTelemetry} />

        <div className="hud-panel">
          <div className="hud-title">Drift Hero</div>
          <div className="hud-row">
            <span>Score</span>
            <strong>{formatScore(telemetry.score)}</strong>
          </div>
          <div className="hud-row">
            <span>Multiplier</span>
            <strong>x{telemetry.multiplier.toFixed(1)}</strong>
          </div>
          <div className="hud-row">
            <span>Speed</span>
            <strong>{speed}</strong>
          </div>
          <div className="hud-row">
            <span>Drift</span>
            <strong>{driftDegrees}°</strong>
          </div>
        </div>

        <div className="yt-player">
          <div className="player-title">Drift Tape</div>
          <div id={YT_PLAYER_ID} />
        </div>

        <div className="controls-legend">
          <div className="legend-title">Controls</div>
          <div className="legend-row">
            <span className="keycap">W</span>
            <span className="keycap">A</span>
            <span className="keycap">S</span>
            <span className="keycap">D</span>
          </div>
          <div className="legend-row">
            <span className="keycap">UP</span>
            <span className="keycap">LEFT</span>
            <span className="keycap">DOWN</span>
            <span className="keycap">RIGHT</span>
          </div>
          <div className="legend-row">
            <span className="keycap wide">SPACE</span>
            <span className="legend-note">Handbrake</span>
          </div>
        </div>
      </section>
    </main>
  );
}
