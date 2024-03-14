/* c8 ignore start */
export type Face<P extends object, I extends unknown[]> = {
  Component: React.ComponentType<P>;
  validator: (...args: I) => P | Promise<P>;
};
