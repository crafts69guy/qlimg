import { expect, it } from "vitest";
import { activate, deactivate } from "./index.js";
import { getEnv } from "./env.js";
import { GalleryDialog } from "./gallery-dialog.js";
import { makeEnv } from "../test/fake-env.js";

it("registers and unregisters the dialog", () => {
  const { fake, env } = makeEnv({ files: [], notes: [] });
  activate(env);
  expect(getEnv()).toBe(env);
  expect(fake.components.registerClass).toHaveBeenCalledWith(GalleryDialog);
  expect(fake.layouts.addComponentToLayout).toHaveBeenCalledWith("modal", "GalleryDialog");

  deactivate(env);
  expect(fake.layouts.removeComponentFromLayout).toHaveBeenCalledWith("modal", "GalleryDialog");
  expect(fake.components.deleteClass).toHaveBeenCalledWith(GalleryDialog);
  expect(() => getEnv()).toThrow(/not activated/);
});
