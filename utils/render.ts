import { render as originalRender } from "ink-testing-library";
import { expect } from "vitest";
import { KeyObject } from "crypto";
import { nextTick as rawNextTick } from "node:process";
import { decryptText, deserializeEncryptedData } from "./crypto";

const nextTick = () =>
  new Promise((resolve) => {
    // The simplest way to wait out until stdin input is rendered
    setTimeout(() => rawNextTick(resolve), 10);
  });

type ModifiedStdin = {
  write: (data: string) => Promise<void>;
  writeLn: (data: string) => Promise<void>;
  enter: () => Promise<void>;
  backspace: (amount?: number) => Promise<void>;
  leftArrow: () => Promise<void>;
  rightArrow: () => Promise<void>;
};
type ExtendedRender = {
  stdin: ModifiedStdin;
  expectOutput: (...expected: (string | null)[]) => void;
  expectEncrypted: (opts: {
    privateKey: KeyObject;
    getEncrypted?: (actual: string[]) => string;
    expected: string;
  }) => void;
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
  const expectOutput: ExtendedRender["expectOutput"] = (...expected) => {
    const lastFrame = rest.lastFrame()!.split("\n");
    // We provide "expected" with newlines sometimes
    const expectedFlat = expected.flatMap((element) =>
      element ? element.split("\n") : element,
    );
    expect(lastFrame.join("\n")).toEqual(
      lastFrame
        .map((_, index) => {
          const expectedLine = expectedFlat[index];
          return expectedLine === null ||
            (expectedLine === undefined &&
              expectedFlat[expectedFlat.length - 1] === null)
            ? lastFrame[index]
            : expectedLine;
        })
        .join("\n"),
    );
  };
  return {
    ...rest,
    stdin: { write, writeLn, enter, backspace, leftArrow, rightArrow },
    expectOutput,
    expectEncrypted: ({
      privateKey,
      getEncrypted = (input) => input.join("\n"),
      expected,
    }) => {
      const actual = getEncrypted(rest.lastFrame()!.split("\n"));
      const encryptedData = deserializeEncryptedData(actual);
      expect(decryptText(encryptedData, privateKey)).toEqual(expected);
    },
  };
};
