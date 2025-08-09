import { useInput } from "ink";

export const useKeepAlive = (shouldKeepAlive: boolean = true) =>
  useInput(() => {}, { isActive: shouldKeepAlive });
