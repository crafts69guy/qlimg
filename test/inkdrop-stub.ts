import { useState } from "react";
import type { UseModalResult } from "@inkdropapp/types/src/inkdrop-module/use-modal.js";

export function useModal(initialState = false): UseModalResult {
  const [visible, setVisible] = useState(initialState);
  return { show: () => setVisible(true), close: () => setVisible(false), state: { visible } };
}
