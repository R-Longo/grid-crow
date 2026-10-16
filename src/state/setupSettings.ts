import type { SetupSettings } from "../types";

/**
 * Setup selections change one field at a time. Each update keeps every other
 * selection exactly as it was, so choosing orientation never resets size or colors,
 * and so on. Kept as a plain function so it can be tested without React.
 */
export type SettingsAction = {
  [K in keyof SetupSettings]: { key: K; value: SetupSettings[K] };
}[keyof SetupSettings];

export function settingsReducer(settings: SetupSettings, action: SettingsAction): SetupSettings {
  return { ...settings, [action.key]: action.value };
}
