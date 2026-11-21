// Presets handed from the dashboard tiles to the wizard without circular imports.

import type { VideoTypeId } from "@msaipro/core";

export interface WizardInit {
  presetType: VideoTypeId | null;
  templateId: string | null;
  /** "idea": short prompt expanded automatically. "text": the user's full script, one line per scene. */
  mode: "idea" | "text";
  name: string;
}

let pending: WizardInit | null = null;

export function setWizardInit(init: WizardInit): void {
  pending = init;
}

export function takeWizardInit(): WizardInit | null {
  const value = pending;
  pending = null;
  return value;
}
