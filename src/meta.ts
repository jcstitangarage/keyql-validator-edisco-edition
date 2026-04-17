declare const __BUILD_TIME__: string;
declare const __BUILD_COMMIT__: string;

export const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";
export const BUILD_COMMIT = typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : "local";

export const REPO_URL = "https://github.com/jcstitangarage/keyql-validator-edisco-edition";
export const REPO_COMMIT_URL = `${REPO_URL}/commit/${BUILD_COMMIT}`;

export function formatBuildDate(iso: string): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}
