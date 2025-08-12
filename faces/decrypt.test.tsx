import React from "react";

import { expect, test, describe, afterEach } from "vitest";
import chalk from "chalk";
import mockfs from "mock-fs";

import { face } from "./decrypt";
import {
  EncryptedData,
  encryptText,
  generatePair,
  serializeEncryptedData,
} from "../utils/crypto";
import { serializeShare } from "../utils/shares";
import { render } from "../utils/render";
import { sequence } from "../utils/promise";
import { pickRandom } from "../utils/array";
import { SHARE_LENGTH } from "../utils/consts";
import { privateKeyToShares } from "../utils/converters";
import { validate } from "../utils/validation";

afterEach(() => {
  mockfs.restore();
});

describe("validation", () => {
  describe("input file", () => {
    test("file does not exist", async () => {
      mockfs({});
      expect(() =>
        validate(face.schema, { input: "non-existent" }),
      ).rejects.toThrow('At "input": Path "non-existent" does not exist.');
    });

    test("target is a directory", async () => {
      const dirPath = "path/to/dir";
      mockfs({ [dirPath]: {} });
      expect(() => validate(face.schema, { input: dirPath })).rejects.toThrow(
        'At "input": File "path/to/dir" is not a file.',
      );
    });

    describe("deserializing encrypted data", () => {
      test("no branding tag", async () => {
        const inputPath = "path/to/input.txt";
        mockfs({ [inputPath]: "x" });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow(
          `Data is invalid, expected data with "sss-enc" prefix.`,
        );
      });

      test("invalid branding tag", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        const serializedData = serializeEncryptedData(encryptedData);
        mockfs({ [inputPath]: serializedData.slice(1) });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow(
          `Data is invalid, expected data with "sss-enc" prefix.`,
        );
      });

      test("no initial vector", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        const serializedData = serializeEncryptedData(encryptedData);
        mockfs({
          [inputPath]: serializedData.split("|").slice(0, 1).join("|"),
        });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow("No initial vector on decryption.");
      });

      test("invalid initial vector length", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        mockfs({
          [inputPath]: serializeEncryptedData({
            ...encryptedData,
            initVector: `${encryptedData.initVector.slice(0, -10)}malformed`,
          }),
        });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow("Initial vector has to have length of 24 bytes.");
      });

      test("no auth tag", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        const serializedData = serializeEncryptedData(encryptedData);
        mockfs({
          [inputPath]: serializedData.split("|").slice(0, 2).join("|"),
        });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow("No auth tag on decryption.");
      });

      test("invalid auth tag length", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        mockfs({
          [inputPath]: serializeEncryptedData({
            ...encryptedData,
            authTag: `${encryptedData.authTag.slice(0, -10)}malformed`,
          }),
        });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow("Auth tag has to have length of 24 bytes.");
      });

      test("no symmetric key", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        const serializedData = serializeEncryptedData(encryptedData);
        mockfs({
          [inputPath]: serializedData.split("|").slice(0, 3).join("|"),
        });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow("No RSA encrypted key on decryption.");
      });

      test("invalid symmetric key", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        mockfs({
          [inputPath]: serializeEncryptedData({
            ...encryptedData,
            encryptedAesKey: `${encryptedData.encryptedAesKey.slice(0, -10)}malformed`,
          }),
        });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow("Encrypted AES key has to have length of 344 bytes.");
      });

      test("no encrypted text", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        const serializedData = serializeEncryptedData(encryptedData);
        mockfs({
          [inputPath]: serializedData.split("|").slice(0, 4).join("|"),
        });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow("No text to decrypt on decryption.");
      });

      test("extra data after delimiter", async () => {
        const inputPath = "path/to/input.txt";
        const encryptedData = encryptText(
          "input to encrypt",
          generatePair().publicKey,
        );
        const serializedData = serializeEncryptedData(encryptedData);
        mockfs({
          [inputPath]: [...serializedData.split("|"), "extra"].join("|"),
        });
        expect(() =>
          validate(face.schema, { input: inputPath }),
        ).rejects.toThrow("Extra data on decryption.");
      });
    });
  });

  test("successful validation", async () => {
    const inputPath = "path/to/input.txt";
    const inputToDecrypt = "input to encrypt";
    const encryptedData = encryptText(inputToDecrypt, generatePair().publicKey);
    mockfs({ [inputPath]: serializeEncryptedData(encryptedData) });
    const props = await validate(face.schema, { input: inputPath });
    expect(props).toEqual<typeof props>({ encryptedData });
  });
});

describe("decryption", () => {
  describe("errors", () => {
    test("corrupted shares", async () => {
      const { privateKey, publicKey } = generatePair();
      const encryptedData = encryptText(
        "Hello world\nNext line please",
        publicKey,
      );
      const threshold = 3;
      const privateKeyShares = privateKeyToShares(privateKey, {
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
        <face.Component encryptedData={encryptedData} />,
      );
      await stdin.writeLn(privateKeyShares[0]);
      expectOutput(
        "Please input share #1",
        chalk.green("(input of length 1602)"),
        "Error: Share format is incorrect",
      );
    });

    test("invalid shares", async () => {
      const { privateKey, publicKey } = generatePair();
      const encryptedData = encryptText(
        "Hello world\nNext line please",
        publicKey,
      );
      const threshold = 3;
      const privateKeyShares = privateKeyToShares(privateKey, {
        threshold,
        shares: 5,
      }).map((share) =>
        serializeShare({
          ...share,
          data: share.data[0] === "a" ? "b" : `a${share.data.slice(1)}`,
        }),
      );

      const { expectOutput, stdin } = await render(
        <face.Component encryptedData={encryptedData} />,
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

    describe("corrupted input data", () => {
      const runWith = async (
        modifyData: (data: EncryptedData) => EncryptedData,
        message: string,
      ) => {
        const { privateKey, publicKey } = generatePair();
        const encryptedData = encryptText(
          "Hello world\nNext line please",
          publicKey,
        );
        const threshold = 3;
        const privateKeyShares = privateKeyToShares(privateKey, {
          threshold,
          shares: 5,
        }).map(serializeShare);

        const { expectOutput, stdin } = await render(
          <face.Component encryptedData={modifyData(encryptedData)} />,
        );
        await sequence(
          ...privateKeyShares
            .slice(0, threshold)
            .map((share) => () => stdin.writeLn(share)),
        );
        expectOutput("Fatal error:", message, 'Press "Enter" to restart');
      };

      const replaceFirstSymbol = (input: string) =>
        `${input[0] === "x" ? "y" : "x"}${input.slice(1)}`;

      test("initial vector malformed", async () => {
        await runWith(
          (encryptedData) => ({
            ...encryptedData,
            initVector: replaceFirstSymbol(encryptedData.initVector),
          }),
          `Can't decrypt text, probably initial vector or auth tag is corrupt.`,
        );
      });

      test("auth tag malformed", async () => {
        await runWith(
          (encryptedData) => ({
            ...encryptedData,
            authTag: replaceFirstSymbol(encryptedData.authTag),
          }),
          `Can't decrypt text, probably initial vector or auth tag is corrupt.`,
        );
      });

      test("symmetric key malformed", async () => {
        await runWith(
          (encryptedData) => ({
            ...encryptedData,
            encryptedAesKey: replaceFirstSymbol(encryptedData.encryptedAesKey),
          }),
          "Can't decrypt text, probably text is corrupt.",
        );
      });
    });

    test("malformed share format", async () => {
      const { privateKey, publicKey } = generatePair();
      const encryptedData = encryptText(
        "Hello world\nNext line please",
        publicKey,
      );
      const threshold = 3;
      const privateKeyShares = privateKeyToShares(privateKey, {
        threshold,
        shares: 5,
      }).map((share) =>
        serializeShare({ ...share, data: `${share.data}malformed` }),
      );

      const { expectOutput, stdin } = await render(
        <face.Component encryptedData={encryptedData} />,
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
        const encryptedData = encryptText(
          "Hello world\nNext line please",
          generatePair().publicKey,
        );
        const { expectOutput, stdin } = await render(
          <face.Component encryptedData={encryptedData} />,
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
        const encryptedData = encryptText(
          "Hello world\nNext line please",
          generatePair().publicKey,
        );
        const { expectOutput, stdin } = await render(
          <face.Component encryptedData={encryptedData} />,
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
      const { privateKey, publicKey } = generatePair();
      const encryptedData = encryptText(
        "Hello world\nNext line please",
        publicKey,
      );
      const privateKeyShares = privateKeyToShares(privateKey, {
        threshold: 3,
        shares: 5,
      }).map((share, index) =>
        serializeShare({ ...share, threshold: share.threshold + index }),
      );

      const { expectOutput, stdin } = await render(
        <face.Component encryptedData={encryptedData} />,
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
    const encryptedData = encryptText(
      "Hello world\nNext line please",
      generatePair().publicKey,
    );
    const { expectOutput, stdin } = await render(
      <face.Component encryptedData={encryptedData} />,
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
    const encryptedData = encryptText(
      "Hello world\nNext line please",
      generatePair().publicKey,
    );
    const threshold = 2 + Math.floor(Math.random() * 100);
    const { expectOutput, stdin } = await render(
      <face.Component encryptedData={encryptedData} />,
    );
    await stdin.writeLn(
      serializeShare({
        threshold,
        bits: 8,
        id: 1,
        data: Buffer.from("a".repeat(SHARE_LENGTH * 0.75)).toString("base64"),
      }),
    );
    expectOutput(
      "Input share #1 registered.",
      `Please input share #2 (out of ${threshold})`,
      chalk.red("(no input)"),
    );
  });

  test("shares registration displayed properly", async () => {
    const encryptedData = encryptText(
      "Hello world\nNext line please",
      generatePair().publicKey,
    );
    const threshold = 5 + Math.floor(Math.random() * 10);
    const { expectOutput, stdin } = await render(
      <face.Component encryptedData={encryptedData} />,
    );
    await sequence(
      ...new Array(threshold - 1).fill(null).map((_, index) => async () => {
        await stdin.writeLn(
          serializeShare({
            threshold,
            bits: 8,
            id: index + 1,
            data: Buffer.from("a".repeat(SHARE_LENGTH * 0.75)).toString(
              "base64",
            ),
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
    const textToEncrypt = "Hello world\nNext line please";
    const { privateKey, publicKey } = generatePair();
    const encryptedData = encryptText(textToEncrypt, publicKey);
    const threshold = 3;
    const privateKeyShares = privateKeyToShares(privateKey, {
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
      <face.Component encryptedData={encryptedData} />,
    );
    await sequence(
      ...privateKeyShares
        .slice(0, threshold)
        .map((privateKeyShare) => () => stdin.writeLn(privateKeyShare)),
    );
    expectOutput("Decrypt result:", textToEncrypt);
  });
});
