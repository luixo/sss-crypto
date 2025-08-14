import { useInput } from "ink";

export const useKeepAlive = (shouldKeepAlive = true) =>
  useInput(() => {}, { isActive: shouldKeepAlive });
