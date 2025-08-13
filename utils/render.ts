import { render as originalRender } from "ink-testing-library";
import { nextTick as rawNextTick } from "node:process";

const nextTick = () =>
  new Promise((resolve) => {
    // The simplest way to wait out until stdin input is rendered
    setTimeout(() => rawNextTick(resolve), 10);
  });

type RenderControls = {
  stdin: {
    write: (data: string) => Promise<void>;
    writeLn: (data: string) => Promise<void>;
    enter: () => Promise<void>;
    backspace: (amount?: number) => Promise<void>;
    leftArrow: () => Promise<void>;
    rightArrow: () => Promise<void>;
  };
  lastFrameLines: (delimiter?: string) => string[];
} & Pick<ReturnType<typeof originalRender>, "stdout">;
export const render = async (
  ...args: Parameters<typeof originalRender>
): Promise<RenderControls> => {
  const { stdin: originalStdin, lastFrame, stdout } = originalRender(...args);
  const write = async (data: string) => {
    originalStdin.write(data);
    await nextTick();
  };
  const enter = async () => {
    originalStdin.write("\r");
    await nextTick();
  };
  const backspace = async (amount: number = 1) => {
    for (let i = 0; i < amount; i += 1) {
      originalStdin.write("\b");
    }
    await nextTick();
  };
  const leftArrow = async () => {
    originalStdin.write("\x1b[D");
    await nextTick();
  };
  const rightArrow = async () => {
    originalStdin.write("\x1b[C");
    await nextTick();
  };
  const writeLn = async (data: string) => {
    await write(data);
    await enter();
  };
  await nextTick();
  return {
    lastFrameLines: (delimiter = "\n") => {
      /* c8 ignore next */
      const frame = lastFrame() ?? "";
      return frame
        .split(delimiter)
        .map((line) => line.trim())
        .filter(Boolean);
    },
    stdin: { write, writeLn, enter, backspace, leftArrow, rightArrow },
    stdout,
  };
};
