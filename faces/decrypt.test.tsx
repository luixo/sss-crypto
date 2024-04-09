import React from "react";

import { expect, test, describe, afterEach } from "vitest";
import chalk from "chalk";
import mockfs from "mock-fs";

import { face } from "./decrypt";
import { encryptText, generatePair } from "../utils/crypto";
import { createShares, serializeShare } from "../utils/shares";
import { keyToHex } from "../utils/encoding";
import { render } from "../utils/render";
import { sequence } from "../utils/promise";
import { pickRandom } from "../utils/array";

afterEach(() => {
  mockfs.restore();
});

describe("validation", () => {
  test("input is empty", async () => {
    expect(() => face.validator({})).rejects.toThrow(
      "Input should not be empty to decrypt.",
    );
  });

  describe("input file", () => {
    test("file does not exist", async () => {
      mockfs({});
      expect(() => face.validator({ input: "non-existent" })).rejects.toThrow(
        'Input at "non-existent" does not exist.',
      );
    });

    test("target is a directory", async () => {
      const dirPath = "path/to/dir";
      mockfs({ [dirPath]: {} });
      expect(() => face.validator({ input: dirPath })).rejects.toThrow(
        'Input at "path/to/dir" is not a file.',
      );
    });
  });

  test("successful validation", async () => {
    const inputPath = "path/to/input.txt";
    const inputToDecrypt = "input to encrypt";
    mockfs({ [inputPath]: inputToDecrypt });
    const props = await face.validator({ input: inputPath });
    expect(props).toEqual<Awaited<ReturnType<(typeof face)["validator"]>>>({
      encryptedText: inputToDecrypt,
    });
  });
});

describe("decryption", () => {
  describe("errors", () => {
    test("corrupted shares", async () => {
      const textToEncrypt = Buffer.from("Hello world\nNext line please");
      const { privateKey, publicKey } = generatePair();
      const encryptedText = encryptText(textToEncrypt, publicKey).toString(
        "base64",
      );
      const threshold = 3;
      const privateKeyShares = createShares(keyToHex(privateKey), {
        threshold,
        shares: 5,
      }).map((share) =>
        serializeShare({
          ...share,
          data: Buffer.from(
            Buffer.from(share.data, "base64").toString("hex").slice(0, -10),
            "hex",
          ).toString("base64"),
        }),
      );

      const { expectOutput, stdin } = await render(
        <face.Component encryptedText={encryptedText} />,
      );
      await sequence(
        ...privateKeyShares
          .slice(0, threshold)
          .map((share) => () => stdin.writeLn(share)),
      );
      expectOutput(
        "Fatal error:",
        "Can't combine shares, probably shares are corrupted",
        'Press "Enter" to restart',
      );
      await stdin.enter();
      expectOutput("Please input share #1", chalk.red("(no input)"));
    });

    test("corrupted input data", async () => {
      const textToEncrypt = Buffer.from("Hello world\nNext line please");
      const { privateKey, publicKey } = generatePair();
      const encryptedText = encryptText(textToEncrypt, publicKey).toString(
        "base64",
      );
      const threshold = 3;
      const privateKeyShares = createShares(keyToHex(privateKey), {
        threshold,
        shares: 5,
      }).map(serializeShare);

      const { expectOutput, stdin } = await render(
        <face.Component
          encryptedText={`${encryptedText.slice(0, -10)}malformed`}
        />,
      );
      await sequence(
        ...privateKeyShares
          .slice(0, threshold)
          .map((share) => () => stdin.writeLn(share)),
      );
      expectOutput(
        "Fatal error:",
        "Can't decrypt text, probably text is corrupt (ERR_OSSL_RSA_DATA_GREATER_THAN_MOD_LEN)",
        'Press "Enter" to restart',
      );
    });

    test("incorrect share format", async () => {
      const textToEncrypt = Buffer.from("Hello world\nNext line please");
      const { privateKey, publicKey } = generatePair();
      const encryptedText = encryptText(textToEncrypt, publicKey).toString(
        "base64",
      );
      const threshold = 3;
      const privateKeyShares = createShares(keyToHex(privateKey), {
        threshold,
        shares: 5,
      }).map((share) =>
        serializeShare({ ...share, data: `${share.data}malformed` }),
      );

      const { expectOutput, stdin } = await render(
        <face.Component encryptedText={encryptedText} />,
      );
      await stdin.writeLn(privateKeyShares[0]);
      expectOutput(
        "Please input share #1",
        chalk.green(`(input of length ${privateKeyShares[0].length})`),
        chalk.red("Error: Expected to have base64 for a share body"),
      );
      await stdin.backspace();
      expectOutput(
        "Please input share #1",
        chalk.green(`(input of length ${privateKeyShares[0].length - 1})`),
      );
    });

    describe("incorrent share format", () => {
      test("some delimiters", async () => {
        const { expectOutput, stdin } = await render(
          <face.Component encryptedText="anything" />,
        );
        const corruptedShare = "3|05|anything";
        await stdin.writeLn(corruptedShare);
        expectOutput(
          "Please input share #1",
          chalk.green(`(input of length ${corruptedShare.length})`),
          chalk.red("Error: Share format is incorrect"),
        );
      });

      test("no delimiters", async () => {
        const { expectOutput, stdin } = await render(
          <face.Component encryptedText="anything" />,
        );
        const corruptedShare = "foo";
        await stdin.writeLn(corruptedShare);
        expectOutput(
          "Please input share #1",
          chalk.green(`(input of length ${corruptedShare.length})`),
          chalk.red("Error: Share format is incorrect"),
        );
      });
    });

    test("mixed thresholds in shares", async () => {
      const textToEncrypt = Buffer.from("Hello world\nNext line please");
      const { privateKey, publicKey } = generatePair();
      const encryptedText = encryptText(textToEncrypt, publicKey).toString(
        "base64",
      );
      const privateKeyShares = createShares(keyToHex(privateKey), {
        threshold: 3,
        shares: 5,
      }).map((share, index) =>
        serializeShare({ ...share, threshold: share.threshold + index }),
      );

      const { expectOutput, stdin } = await render(
        <face.Component encryptedText={encryptedText} />,
      );
      await stdin.writeLn(privateKeyShares[0]);
      await stdin.writeLn(privateKeyShares[1]);
      expectOutput(
        "Fatal error:",
        "Expected all shares to have the same threshold, got 3 and 4",
        'Press "Enter" to restart',
      );
    });
  });

  test("input length properly displayed", async () => {
    const { expectOutput, stdin } = await render(
      <face.Component encryptedText="hello world" />,
    );
    const expectLastLine = (lastLine: string) => {
      expectOutput("Please input share #1", lastLine);
    };
    expectLastLine(chalk.red("(no input)"));
    await stdin.write("1");
    expectLastLine(chalk.green("(input of length 1)"));
    await stdin.write("11");
    expectLastLine(chalk.green("(input of length 3)"));
    await stdin.backspace();
    expectLastLine(chalk.green("(input of length 2)"));
    await stdin.backspace();
    await stdin.backspace();
    expectLastLine(chalk.red("(no input)"));
    await stdin.backspace();
    expectLastLine(chalk.red("(no input)"));
  });

  test("threshold calculated from data properly", async () => {
    const threshold = 2 + Math.floor(Math.random() * 100);
    const { expectOutput, stdin } = await render(
      <face.Component encryptedText="hello world" />,
    );
    await stdin.writeLn(
      serializeShare({
        threshold,
        bits: 8,
        id: 1,
        data: Buffer.from("foo").toString("base64"),
      }),
    );
    expectOutput(
      "Input share #1 registered.",
      `Please input share #2 (out of ${threshold})`,
      chalk.red("(no input)"),
    );
  });

  test("shares registration displayed properly", async () => {
    const threshold = 5 + Math.floor(Math.random() * 10);
    const { expectOutput, stdin } = await render(
      <face.Component encryptedText="hello world" />,
    );
    await sequence(
      ...new Array(threshold - 1).fill(null).map((_, index) => async () => {
        await stdin.writeLn(
          serializeShare({
            threshold,
            bits: 8,
            id: index + 1,
            data: Buffer.from("foo").toString("base64"),
          }),
        );
        expectOutput(
          ...new Array(index + 1)
            .fill(null)
            .map(
              (__, shareIndex) => `Input share #${shareIndex + 1} registered.`,
            ),
          `Please input share #${index + 2} (out of ${threshold})`,
          chalk.red("(no input)"),
        );
      }),
    );
  });

  test("decryption handled successfully", async () => {
    const textToEncrypt = Buffer.from("Hello world\nNext line please");
    const { privateKey, publicKey } = generatePair();
    const encryptedText = encryptText(textToEncrypt, publicKey).toString(
      "base64",
    );
    const threshold = 3;
    const privateKeyShares = createShares(keyToHex(privateKey), {
      threshold,
      shares: 5,
    }).map((share) => {
      const randomIndex = Math.floor(Math.random() * share.data.length);
      return serializeShare({
        ...share,
        data: [
          ...share.data.slice(0, randomIndex),
          pickRandom("\n", "я", "!", "#"),
          ...share.data.slice(randomIndex),
        ].join(""),
      });
    });

    const { expectOutput, stdin } = await render(
      <face.Component encryptedText={encryptedText} />,
    );
    await sequence(
      ...privateKeyShares
        .slice(0, threshold)
        .map((privateKeyShare) => () => stdin.writeLn(privateKeyShare)),
    );
    expectOutput("Decrypt result:", textToEncrypt.toString());
  });
});
