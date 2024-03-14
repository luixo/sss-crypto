export const sequence = async (...fns: (() => Promise<void>)[]) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const fn of fns) {
    // eslint-disable-next-line no-await-in-loop
    await fn();
  }
};
