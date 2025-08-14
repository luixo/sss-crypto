import { expect, test, describe } from "vitest";
import chalk from "chalk";
import fs from "node:fs/promises";
import type z from "zod";

import { face } from "./decrypt";
import type { encryptedBoxSchema } from "../utils/crypto";
import {
  encryptText,
  generatePair,
  serializeEncryptedData,
} from "../utils/crypto";
import { serializeShare } from "../utils/shares";
import { render } from "../utils/render";
import { sequence } from "../utils/promise";
import { SHARE_LENGTH } from "../utils/consts";
import { generateSharesFromKey } from "../utils/converters";
import { mapArgErrors, validate } from "../utils/validation";

const replaceFirstSymbol = (input: string) =>
  `${input.startsWith("x") ? "y" : "x"}${input.slice(1)}`;

describe("validation", () => {
  describe("input file", () => {
    test("file does not exist", async () => {
      await expect(async () =>
        validate(face.schema, { input: "non-existent" }, mapArgErrors),
      ).rejects.toThrow('Path "non-existent" does not exist.');
    });

    test("target is a directory", async () => {
      const dirPath = "path/to/dir";
      await fs.mkdir(dirPath, { recursive: true });
      await expect(async () =>
        validate(face.schema, { input: dirPath }, mapArgErrors),
      ).rejects.toThrow('File "path/to/dir" is not a file.');
    });

    describe("deserializing encrypted data", () => {
      test("invalid branding tag", async () => {
        const inputPath = "path/to/input.txt";
        await fs.writeFile(inputPath, "x|y|z|a|b");
        await expect(async () =>
          validate(face.schema, { input: inputPath }, mapArgErrors),
        ).rejects.toThrow(
          `Data is invalid, expected data with "sss-enc" prefix.`,
        );
      });

      test("invalid initial vector length", async () => {
        const inputPath = "path/to/input.txt";
        const { publicKey } = await generatePair();
        const encryptedData = encryptText("input to encrypt", publicKey);
        await fs.writeFile(
          inputPath,
          serializeEncryptedData({
            ...encryptedData,
            initVector: `${encryptedData.initVector.slice(0, -10)}malformed`,
          }),
        );
        await expect(async () =>
          validate(face.schema, { input: inputPath }, mapArgErrors),
        ).rejects.toThrow("Initial vector has to have length of 24 bytes.");
      });

      test("invalid auth tag length", async () => {
        const inputPath = "path/to/input.txt";
        const { publicKey } = await generatePair();
        const encryptedData = encryptText("input to encrypt", publicKey);
        await fs.writeFile(
          inputPath,
          serializeEncryptedData({
            ...encryptedData,
            authTag: `${encryptedData.authTag.slice(0, -10)}malformed`,
          }),
        );
        await expect(async () =>
          validate(face.schema, { input: inputPath }, mapArgErrors),
        ).rejects.toThrow("Auth tag has to have length of 24 bytes.");
      });

      test("invalid symmetric key", async () => {
        const inputPath = "path/to/input.txt";
        const { publicKey } = await generatePair();
        const encryptedData = encryptText("input to encrypt", publicKey);
        await fs.writeFile(
          inputPath,
          serializeEncryptedData({
            ...encryptedData,
            encryptedAesKey: `${encryptedData.encryptedAesKey.slice(0, -10)}malformed`,
          }),
        );
        await expect(async () =>
          validate(face.schema, { input: inputPath }, mapArgErrors),
        ).rejects.toThrow("Encrypted AES key has to have length of 344 bytes.");
      });

      test("no encrypted text", async () => {
        const inputPath = "path/to/input.txt";
        const { publicKey } = await generatePair();
        const encryptedData = encryptText("input to encrypt", publicKey);
        await fs.writeFile(
          inputPath,
          serializeEncryptedData({ ...encryptedData, encryptedText: "" }),
        );
        await expect(async () =>
          validate(face.schema, { input: inputPath }, mapArgErrors),
        ).rejects.toThrow("No text to decrypt on decryption.");
      });

      test("extra data after delimiter", async () => {
        const inputPath = "path/to/input.txt";
        const { publicKey } = await generatePair();
        const encryptedData = encryptText("input to encrypt", publicKey);
        const serializedData = serializeEncryptedData(encryptedData);
        await fs.writeFile(
          inputPath,
          [...serializedData.split("|"), "extra"].join("|"),
        );
        await expect(async () =>
          validate(face.schema, { input: inputPath }, mapArgErrors),
        ).rejects.toThrow("Extra data on decryption.");
      });
    });
  });

  test("successful validation", async () => {
    const inputPath = "path/to/input.txt";
    const inputToDecrypt = "input to encrypt";
    const { publicKey } = await generatePair();
    const encryptedData = encryptText(inputToDecrypt, publicKey);
    await fs.writeFile(inputPath, serializeEncryptedData(encryptedData));
    const props = await validate(
      face.schema,
      { input: inputPath },
      mapArgErrors,
    );
    expect(props).toEqual<typeof props>({ encryptedData });
  });
});

describe("decryption", () => {
  describe("errors", () => {
    test("corrupted shares", async () => {
      const { privateKey, publicKey } = await generatePair();
      const encryptedData = encryptText(
        "Hello world\nNext line please",
        publicKey,
      );
      const threshold = 3;
      const privateKeyShares = generateSharesFromKey(privateKey, {
        threshold,
        shares: 5,
      }).map((share) => serializeShare(share).replace("|", ""));

      const { lastFrameLines, stdin } = await render(
        <face.Component encryptedData={encryptedData} />,
      );
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await stdin.writeLn(privateKeyShares[0]!);
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "Please input share #1",
          chalk.green("(input of length 1605)"),
          "Error: Share format is incorrect",
        ]);
    });

    test("invalid shares", async () => {
      const { privateKey, publicKey } = await generatePair();
      const encryptedData = encryptText(
        "Hello world\nNext line please",
        publicKey,
      );
      const threshold = 3;
      const privateKeyShares = generateSharesFromKey(privateKey, {
        threshold,
        shares: 5,
      }).map((share) =>
        serializeShare({
          ...share,
          data: share.data.startsWith("a") ? "b" : `a${share.data.slice(1)}`,
        }),
      );

      const { lastFrameLines, stdin } = await render(
        <face.Component encryptedData={encryptedData} />,
      );
      await sequence(
        ...privateKeyShares
          .slice(0, threshold)
          .map((share) => async () => stdin.writeLn(share)),
      );
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "Fatal error:",
          "Can't combine shares, probably shares are corrupted",
          'Press "Enter" to restart',
        ]);
      await stdin.enter();
      await expect
        .poll(lastFrameLines)
        .toEqual(["Please input share #1", chalk.red("(no input)")]);
    });

    describe("corrupted input data", () => {
      const runWith = async (
        modifyData: (
          data: z.infer<typeof encryptedBoxSchema>,
        ) => z.infer<typeof encryptedBoxSchema>,
        message: string,
      ) => {
        const { privateKey, publicKey } = await generatePair();
        const encryptedData = encryptText(
          "Hello world\nNext line please",
          publicKey,
        );
        const threshold = 3;
        const privateKeyShares = generateSharesFromKey(privateKey, {
          threshold,
          shares: 5,
        }).map(serializeShare);

        const { lastFrameLines, stdin } = await render(
          <face.Component encryptedData={modifyData(encryptedData)} />,
        );
        await sequence(
          ...privateKeyShares
            .slice(0, threshold)
            .map((share) => async () => stdin.writeLn(share)),
        );
        await expect
          .poll(lastFrameLines)
          .toEqual(["Fatal error:", message, 'Press "Enter" to restart']);
      };

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
      const { privateKey, publicKey } = await generatePair();
      const encryptedData = encryptText(
        "Hello world\nNext line please",
        publicKey,
      );
      const threshold = 3;
      const privateKeyShares = generateSharesFromKey(privateKey, {
        threshold,
        shares: 5,
      }).map((share) => {
        const serializedShare = serializeShare(share);
        return `${serializedShare.slice(0, -1)}!`;
      });

      const { lastFrameLines, stdin } = await render(
        <face.Component encryptedData={encryptedData} />,
      );
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await stdin.writeLn(privateKeyShares[0]!);
      await expect.poll(lastFrameLines).toEqual([
        "Please input share #1",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chalk.green(`(input of length ${privateKeyShares[0]!.length - 1})`),
        chalk.red(`Error: Expected to have base64 for a share body`),
        chalk.red(`Expected to have 1600 symbols for a share body`),
      ]);
      await stdin.backspace();
      await expect.poll(lastFrameLines).toEqual([
        "Please input share #1",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        chalk.green(`(input of length ${privateKeyShares[0]!.length - 2})`),
      ]);
    });

    describe("incorrent share format", () => {
      test("some delimiters", async () => {
        const { publicKey } = await generatePair();
        const encryptedData = encryptText(
          "Hello world\nNext line please",
          publicKey,
        );
        const { lastFrameLines, stdin } = await render(
          <face.Component encryptedData={encryptedData} />,
        );
        const corruptedShare = "3|05|anything";
        await stdin.writeLn(corruptedShare);
        await expect
          .poll(lastFrameLines)
          .toEqual([
            "Please input share #1",
            chalk.green(`(input of length ${corruptedShare.length})`),
            chalk.red("Error: Share format is incorrect"),
          ]);
      });

      test("no delimiters", async () => {
        const { publicKey } = await generatePair();
        const encryptedData = encryptText(
          "Hello world\nNext line please",
          publicKey,
        );
        const { lastFrameLines, stdin } = await render(
          <face.Component encryptedData={encryptedData} />,
        );
        const corruptedShare = "foo";
        await stdin.writeLn(corruptedShare);
        await expect
          .poll(lastFrameLines)
          .toEqual([
            "Please input share #1",
            chalk.green(`(input of length ${corruptedShare.length})`),
            chalk.red("Error: Share format is incorrect"),
          ]);
      });
    });

    test("mixed thresholds in shares", async () => {
      const { privateKey, publicKey } = await generatePair();
      const encryptedData = encryptText(
        "Hello world\nNext line please",
        publicKey,
      );
      const privateKeyShares = generateSharesFromKey(privateKey, {
        threshold: 3,
        shares: 5,
      }).map((share, index) =>
        serializeShare({ ...share, threshold: share.threshold + index }),
      );

      const { lastFrameLines, stdin } = await render(
        <face.Component encryptedData={encryptedData} />,
      );
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await stdin.writeLn(privateKeyShares[0]!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await stdin.writeLn(privateKeyShares[1]!);
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "Fatal error:",
          "Expected all shares to have the same threshold, got 3 and 4",
          'Press "Enter" to restart',
        ]);
    });
  });

  test("input length properly displayed", async () => {
    const { publicKey } = await generatePair();
    const encryptedData = encryptText(
      "Hello world\nNext line please",
      publicKey,
    );
    const { lastFrameLines, stdin } = await render(
      <face.Component encryptedData={encryptedData} />,
    );
    const expectLastLine = async (lastLine: string) =>
      expect.poll(lastFrameLines).toEqual(["Please input share #1", lastLine]);

    await expectLastLine(chalk.red("(no input)"));
    await stdin.write("1");
    await expectLastLine(chalk.green("(input of length 1)"));
    await stdin.write("11");
    await expectLastLine(chalk.green("(input of length 3)"));
    await stdin.backspace();
    await expectLastLine(chalk.green("(input of length 2)"));
    await stdin.backspace();
    await stdin.backspace();
    await expectLastLine(chalk.red("(no input)"));
    await stdin.backspace();
    await expectLastLine(chalk.red("(no input)"));
  });

  test("threshold calculated from data properly", async () => {
    const { publicKey } = await generatePair();
    const encryptedData = encryptText(
      "Hello world\nNext line please",
      publicKey,
    );
    const threshold = 2 + Math.floor(Math.random() * 100);
    const { lastFrameLines, stdin } = await render(
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
    await expect
      .poll(lastFrameLines)
      .toEqual([
        "Input share #1 registered.",
        `Please input share #2 (out of ${threshold})`,
        chalk.red("(no input)"),
      ]);
  });

  test("shares registration displayed properly", async () => {
    const { publicKey } = await generatePair();
    const encryptedData = encryptText(
      "Hello world\nNext line please",
      publicKey,
    );
    const threshold = 5 + Math.floor(Math.random() * 10);
    const { lastFrameLines, stdin } = await render(
      <face.Component encryptedData={encryptedData} />,
    );
    await sequence(
      ...Array.from({ length: threshold - 1 }).map((_, index) => async () => {
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
        await expect
          .poll(lastFrameLines)
          .toEqual([
            ...Array.from({ length: index + 1 }).map(
              (__, shareIndex) => `Input share #${shareIndex + 1} registered.`,
            ),
            `Please input share #${index + 2} (out of ${threshold})`,
            chalk.red("(no input)"),
          ]);
      }),
    );
  });

  test("decryption handled successfully", async () => {
    const textToEncrypt = "Hello world\nNext line please";
    const { privateKey, publicKey } = await generatePair();
    const encryptedData = encryptText(textToEncrypt, publicKey);
    const threshold = 3;
    const privateKeyShares = generateSharesFromKey(privateKey, {
      threshold,
      shares: 5,
    }).map(serializeShare);

    const { lastFrameLines, stdin } = await render(
      <face.Component encryptedData={encryptedData} />,
    );
    await sequence(
      ...privateKeyShares
        .slice(0, threshold)
        .map((privateKeyShare) => async () => stdin.writeLn(privateKeyShare)),
    );
    await expect
      .poll(lastFrameLines)
      .toEqual(["Decrypt result:", ...textToEncrypt.split("\n")]);
  });
});
