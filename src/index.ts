import type { Environment } from "@inkdropapp/types";
import { GalleryDialog } from "./gallery-dialog.js";
import { setEnv } from "./env.js";

export function activate(env: Environment): void {
  setEnv(env);
  env.components.registerClass(GalleryDialog);
  env.layouts.addComponentToLayout("modal", "GalleryDialog");
}

export function deactivate(env: Environment): void {
  env.layouts.removeComponentFromLayout("modal", "GalleryDialog");
  env.components.deleteClass(GalleryDialog);
  setEnv(null);
}
