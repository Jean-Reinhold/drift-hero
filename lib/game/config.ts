import { TrackConfig } from "./track";
import { mulberry32 } from "./utils";

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function createTrackConfig(seed: number): TrackConfig {
  const rng = mulberry32(seed);

  return {
    seed,
    width: 180,
    bands: [
      {
        amplitude: 150,
        frequency: 0.0042,
        phase: rng() * Math.PI * 2
      },
      {
        amplitude: 110,
        frequency: 0.0105,
        phase: rng() * Math.PI * 2
      },
      {
        amplitude: 70,
        frequency: 0.0205,
        phase: rng() * Math.PI * 2
      },
      {
        amplitude: 40,
        frequency: 0.033,
        phase: rng() * Math.PI * 2
      }
    ]
  };
}
