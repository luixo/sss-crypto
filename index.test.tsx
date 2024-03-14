import { expect, test, describe, vi, beforeEach, Mock } from "vitest";
import chalk from "chalk";
import React from "react";
import { Readable } from "stream";
import { useApp } from "ink";

import { createProgram } from "./index";
import { face as encryptFace } from "./faces/encrypt";
import { face as decryptFace } from "./faces/decrypt";
import { face as generateSharesFace } from "./faces/generate-shares";
import { generatePair, parsePublicKey } from "./utils/crypto";
import { keyToPem } from "./utils/encoding";
import { Face } from "./faces/types";

type FaceMock<I extends unknown[], P> = {
  validator: Mock<I, P>;
  Component: Mock<[P], null>;
};
const face = vi.hoisted<FaceMock<[], object>>(() => ({
  validator: vi.fn(() => ({})).mockName("validator"),
  Component: vi
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .fn((_) => {
      const app = useApp();
      React.useEffect(() => app.exit(), [app]);
      return null;
    })
    .mockName("Component"),
}));

vi.mock("./faces/encrypt", () => ({ face }));
vi.mock("./faces/decrypt", () => ({ face }));
vi.mock("./faces/generate-shares", () => ({ face }));

const testProgram = async (input: string, stdin: string = "") => {
  const program = createProgram(Readable.from(stdin));
  const stdout: string[] = [];
  const stderr: string[] = [];
  program
    .configureOutput({
      writeOut: (str) => stdout.push(`[OUT] ${str}`),
      writeErr: (str) => stderr.push(`[ERR] ${str}`),
      outputError: (str, write) => write(chalk.red(str)),
    })
    .exitOverride(({ code, message }) => {
      throw new Error(`Exit [${code}]: ${message}`);
    });
  try {
    await program.parseAsync(input.split(" "), { from: "user" });
  } catch {
    /* empty */
  }
  return { stdout, stderr };
};

const expectFace = <I extends unknown[], P>(
  { validator, Component }: FaceMock<I, P>,
  validatorArgs: I,
  componentArg: P,
) => {
  expect(validator).toHaveBeenCalledTimes(1);
  expect(validator).toHaveBeenCalledWith(...validatorArgs);
  expect(Component).toHaveBeenCalledTimes(1);
  expect(Component).toHaveBeenCalledWith(componentArg, {});
};

const expectStderr = (stderr: string[], error: string) => {
  const emptyError = chalk.red("z").replace("z", "");
  expect(stderr).toEqual([`[ERR] ${chalk.red(error)}\n${emptyError}`]);
};

const mockedFace = <I extends unknown[], P extends object>(
  faceToMock: Face<P, I>,
) => faceToMock as FaceMock<I, P>;

beforeEach(() => {
  face.Component.mockClear();
  face.validator.mockClear();
});

describe("encrypt", () => {
  const publicKey = parsePublicKey(
    Buffer.from(keyToPem(generatePair().publicKey)),
  );
  const faceMock = mockedFace(encryptFace);
  beforeEach(() => {
    faceMock.validator.mockImplementation((input) => ({ publicKey, input }));
  });

  test("stdin", async () => {
    const input = "Hello world";
    const { stderr } = await testProgram("encrypt", input);
    expectFace(faceMock, [input, { pub: "pub.key" }], { publicKey, input });
    expect(stderr).toHaveLength(0);
  });

  test("default public key", async () => {
    const { stderr } = await testProgram("encrypt");
    expectFace(faceMock, ["", { pub: "pub.key" }], { publicKey, input: "" });
    expect(stderr).toHaveLength(0);
  });

  test("explicit public key", async () => {
    const { stderr } = await testProgram("encrypt -p specific.key");
    expectFace(faceMock, ["", { pub: "specific.key" }], {
      publicKey,
      input: "",
    });
    expect(stderr).toHaveLength(0);
  });
});

describe("decrypt", () => {
  const faceMock = mockedFace(decryptFace);
  beforeEach(() => {
    faceMock.validator.mockImplementation((encryptedText) => ({
      encryptedText,
    }));
  });

  test("no text passed", async () => {
    const { stderr } = await testProgram("decrypt");
    expectFace(faceMock, [""], { encryptedText: "" });
    expect(stderr).toHaveLength(0);
  });

  test("text passed", async () => {
    const inputText = "passed text";
    const { stderr } = await testProgram("decrypt", inputText);
    expectFace(faceMock, [inputText], { encryptedText: inputText });
    expect(stderr).toHaveLength(0);
  });
});

describe("generate shares", () => {
  const faceMock = mockedFace(generateSharesFace);
  beforeEach(() => {
    faceMock.validator.mockImplementation((options) => ({
      threshold: Number(options.threshold),
      shares: Number(options.shares),
      pubKeyFilePath: options.pubOutput,
    }));
  });

  test("no threshold passed", async () => {
    const { stderr } = await testProgram("generate-shares");
    expect(faceMock.validator).toHaveBeenCalledTimes(0);
    expect(faceMock.Component).toHaveBeenCalledTimes(0);
    expectStderr(
      stderr,
      `error: required option '-k, --threshold <amount>' not specified`,
    );
  });

  test("no shares passed", async () => {
    const { stderr } = await testProgram("generate-shares -k 2");
    expect(faceMock.validator).toHaveBeenCalledTimes(0);
    expect(faceMock.Component).toHaveBeenCalledTimes(0);
    expectStderr(
      stderr,
      `error: required option '-n, --shares <amount>' not specified`,
    );
  });

  test("threshold and shares passed", async () => {
    const { stderr } = await testProgram("generate-shares -k 2 -n 10");
    expectFace(faceMock, [{ threshold: "2", shares: "10" }], {
      threshold: 2,
      shares: 10,
    });
    expect(stderr).toHaveLength(0);
  });
});

describe("errors", () => {
  const faceMock = mockedFace(encryptFace);

  test("error on validation", async () => {
    faceMock.validator.mockImplementation(() => {
      throw new Error("Unexpected validation error");
    });
    const { stderr } = await testProgram("encrypt");
    expect(faceMock.validator).toHaveBeenCalledTimes(1);
    expect(faceMock.validator).toHaveBeenCalledWith("", { pub: "pub.key" });
    expect(faceMock.Component).toHaveBeenCalledTimes(0);
    expectStderr(stderr, `Error: Unexpected validation error`);
  });
});
