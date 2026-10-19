import type { Environment } from "@inkdropapp/types";

let env: Environment | null = null;

export function setEnv(e: Environment | null): void {
  env = e;
}

export function getEnv(): Environment {
  if (!env) throw new Error("qlimg: plugin is not activated");
  return env;
}
