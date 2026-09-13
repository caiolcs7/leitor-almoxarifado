import { defaultSettings, type Settings } from './models';

/** Upgrade the original IT-only default without replacing customized rules. */
export function upgradeLegacySettings(settings: Settings): Settings {
  const patterns = settings.rules.productPatterns;
  if (patterns.length !== 1 || patterns[0] !== '^IT[A-Z0-9]{3,62}$')
    return settings;
  return {
    ...settings,
    rules: {
      ...settings.rules,
      productPatterns: [...defaultSettings.rules.productPatterns],
    },
  };
}
