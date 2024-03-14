import { render as originalRender } from "ink-testing-library";
import { expect } from "vitest";

const nextTick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1);
  });

type ModifiedStdin = {
  write: (data: string) => Promise<void>;
  writeLn: (data: string) => Promise<void>;
  enter: () => Promise<void>;
  backspace: () => Promise<void>;
};
type ExtendedRender = {
  stdin: ModifiedStdin;
  expectOutput: (...expected: string[]) => void;
};
export const render = async (
  ...args: Parameters<typeof originalRender>
): Promise<
  Omit<ReturnType<typeof originalRender>, "stdin"> & ExtendedRender
> => {
  const { stdin: originalStdin, ...rest } = originalRender(...args);
  const write = async (data: string) => {
    originalStdin.write(data);
    await nextTick();
  };
  const enter = async () => {
    originalStdin.write("\r");
    await nextTick();
  };
  const backspace = async () => {
    originalStdin.write("\b");
    await nextTick();
  };
  const writeLn = async (data: string) => {
    await write(data);
    await enter();
  };
  await nextTick();
  return {
    ...rest,
    stdin: { write, writeLn, enter, backspace },
    expectOutput: (...expected) => {
      expect(rest.lastFrame()).toEqual(expected.join("\n"));
    },
  };
};
