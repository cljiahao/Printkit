// Per-NIIMBOT-model config -- printDirection differs by physical model
// (niimbluelib's own example defaults to "left"; the B1 needs "top").
// One entry today; adding a second supported model is a config entry here,
// not a code change in niimbot-print.ts.
export const NIIMBOT_MODELS = {
  B1: { printDirection: "top" as const },
} as const;

export type NiimbotModel = keyof typeof NIIMBOT_MODELS;

export const DEFAULT_NIIMBOT_MODEL: NiimbotModel = "B1";
