import { render as originalRender } from "ink-testing-library";
import { nextTick as rawNextTick } from "node:process";

const nextTick = () =>
  new Promise<void>((resolve) => {
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
  const waitFrame = async (fn?: () => Promise<void>) => {
    await fn?.();
    await nextTick();
  };
  const write = (data: string) =>
    waitFrame(async () => originalStdin.write(data));
  const enter = () => write("\r");
  const backspace = async (amount: number = 1) => {
    await waitFrame(async () => {
      for (let i = 0; i < amount; i += 1) {
        originalStdin.write("\b");
      }
    });
  };
  const leftArrow = () => write("\x1b[D");
  const rightArrow = () => write("\x1b[C");
  const writeLn = async (data: string) => {
    await write(data);
    await enter();
  };
  await waitFrame();
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
