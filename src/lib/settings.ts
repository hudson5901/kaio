import fs from "fs/promises";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

export interface AppSettings {
  profitMarginPercent: number;
  ebayFeePercent: number;
  adPercent: number;
  customsDutyPercent: number;
  salesTaxPercent: number;
  shippingDiscountPercent: number;
  defaultWeightG: number;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
}

const defaults: AppSettings = {
  profitMarginPercent: 30,
  ebayFeePercent: 16,
  adPercent: 5,
  customsDutyPercent: 10,
  salesTaxPercent: 6,
  shippingDiscountPercent: 0,
  defaultWeightG: 2000,
  autoSyncEnabled: false,
  autoSyncIntervalMinutes: 60,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const data = await fs.readFile(SETTINGS_PATH, "utf-8");
    return { ...defaults, ...JSON.parse(data) };
  } catch {
    return { ...defaults };
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const merged = { ...current, ...settings };

  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(merged, null, 2));

  return merged;
}
