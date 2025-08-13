import React from "react";

import { test, describe, expect } from "vitest";
import chalk from "chalk";

import { face } from "./add-share";
import { decryptText, encryptText, generatePair } from "../utils/crypto";
import { deserializeShare, serializeShare } from "../utils/shares";
import { render } from "../utils/render";
import { sequence } from "../utils/promise";
import { SHARE_LENGTH, SHARE_PREFIX_LENGTH } from "../utils/consts";
import { privateKeyToShares, sharesToPrivateKey } from "../utils/converters";

describe("add share", () => {
  describe("errors", () => {
    test("corrupted shares", async () => {
      const { privateKey } = generatePair();
      const threshold = 3;
      const privateKeyShares = privateKeyToShares(privateKey, {
        threshold,
        shares: 5,
      }).map((share) => serializeShare(share).replace("|", ""));

      const { lastFrameLines, stdin } = await render(<face.Component />);
      stdin.writeLn(privateKeyShares[0]);
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "Please input share #1",
          chalk.green("(input of length 1605)"),
          'Error: At "<root>": Share format is incorrect',
        ]);
    });

    test("invalid shares", async () => {
      const { privateKey } = generatePair();
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

      const { lastFrameLines, stdin } = await render(<face.Component />);
      await sequence(
        ...privateKeyShares
          .slice(0, threshold)
          .map((share) => () => stdin.writeLn(share)),
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

    test("malformed share format", async () => {
      const { privateKey } = generatePair();
      const threshold = 3;
      const privateKeyShares = privateKeyToShares(privateKey, {
        threshold,
        shares: 5,
      }).map((share) =>
        serializeShare({
          ...share,
          data: `=${share.data.slice(1)}`,
        }),
      );

      const { lastFrameLines, stdin } = await render(<face.Component />);
      await stdin.writeLn(privateKeyShares[0]);
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "Please input share #1",
          chalk.green(`(input of length ${privateKeyShares[0].length})`),
          chalk.red(
            'Error: At "data": Expected to have base64 for a share body',
          ),
        ]);
      await stdin.backspace();
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "Please input share #1",
          chalk.green(`(input of length ${privateKeyShares[0].length - 1})`),
        ]);
    });

    describe("incorrent share format", () => {
      test("some delimiters", async () => {
        const { lastFrameLines, stdin } = await render(<face.Component />);
        const corruptedShare = "3|05|anything";
        await stdin.writeLn(corruptedShare);
        await expect
          .poll(lastFrameLines)
          .toEqual([
            "Please input share #1",
            chalk.green(`(input of length ${corruptedShare.length})`),
            chalk.red('Error: At "<root>": Share format is incorrect'),
          ]);
      });

      test("no delimiters", async () => {
        const { lastFrameLines, stdin } = await render(<face.Component />);
        const corruptedShare = "foo";
        await stdin.writeLn(corruptedShare);
        await expect
          .poll(lastFrameLines)
          .toEqual([
            "Please input share #1",
            chalk.green(`(input of length ${corruptedShare.length})`),
            chalk.red('Error: At "<root>": Share format is incorrect'),
          ]);
      });
    });

    test("mixed thresholds in shares", async () => {
      const { privateKey } = generatePair();
      const privateKeyShares = privateKeyToShares(privateKey, {
        threshold: 3,
        shares: 5,
      }).map((share, index) =>
        serializeShare({ ...share, threshold: share.threshold + index }),
      );

      const { lastFrameLines, stdin } = await render(<face.Component />);
      await stdin.writeLn(privateKeyShares[0]);
      await stdin.writeLn(privateKeyShares[1]);
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
    const { lastFrameLines, stdin } = await render(<face.Component />);
    const expectLastLine = (lastLine: string) =>
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
    const threshold = 2 + Math.floor(Math.random() * 100);
    const { lastFrameLines, stdin } = await render(<face.Component />);
    const s = serializeShare({
      threshold,
      bits: 8,
      id: 1,
      data: Buffer.from("a".repeat(SHARE_LENGTH * 0.75)).toString("base64"),
    });
    await stdin.writeLn(s);
    await expect
      .poll(lastFrameLines)
      .toEqual([
        "Input share #1 registered.",
        `Please input share #2 (out of ${threshold})`,
        chalk.red("(no input)"),
      ]);
  });

  test("shares registration displayed properly", async () => {
    const threshold = 5 + Math.floor(Math.random() * 10);
    const { lastFrameLines, stdin } = await render(<face.Component />);
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
        await expect
          .poll(lastFrameLines)
          .toEqual([
            ...new Array(index + 1)
              .fill(null)
              .map(
                (__, shareIndex) =>
                  `Input share #${shareIndex + 1} registered.`,
              ),
            `Please input share #${index + 2} (out of ${threshold})`,
            chalk.red("(no input)"),
          ]);
      }),
    );
  });

  test("adding share handled successfully", async () => {
    const { privateKey } = generatePair();
    const threshold = 3;
    const privateKeyShares = privateKeyToShares(privateKey, {
      threshold,
      shares: 5,
    }).map(serializeShare);

    const { stdin, lastFrameLines } = await render(<face.Component />);
    await sequence(
      ...privateKeyShares
        .slice(0, threshold)
        .map((privateKeyShare) => () => stdin.writeLn(privateKeyShare)),
    );
    await expect
      .poll(() => {
        const blocks = lastFrameLines("\n\n");
        return blocks.map((block) => {
          const lines = block.split("\n");
          if (lines[0].includes("Share #")) {
            return [
              ...lines.slice(0, 1),
              `share: ${lines.slice(1).reduce((acc, line) => acc + line.length, 0)}`,
            ];
          }
          return lines;
        });
      })
      .toEqual([
        [
          chalk.yellow(
            "! Save this data, it will be erased when you close the terminal !",
          ),
        ],
        ...Array.from({ length: 1 }).map((_, index) => [
          chalk.green(`Share #${threshold + index + 1}`),
          `share: ${SHARE_LENGTH + SHARE_PREFIX_LENGTH}`,
        ]),
      ]);
  });

  test("new shares can decrypt the data", async () => {
    const { privateKey, publicKey } = generatePair();
    const threshold = 3;
    const privateKeyShares = privateKeyToShares(privateKey, {
      threshold,
      shares: 5,
    }).map(serializeShare);

    const { stdin, lastFrameLines } = await render(<face.Component />);
    await sequence(
      ...privateKeyShares
        .slice(0, threshold)
        .map((privateKeyShare) => () => stdin.writeLn(privateKeyShare)),
    );

    const [, lastBlock] = lastFrameLines("\n\n");
    const serializedShares = [
      ...privateKeyShares.slice(0, threshold - 1),
      lastBlock.split("\n").slice(1).join(""),
    ];

    const textToEncrypt = "Hello world\nNext line please";
    const encryptedData = encryptText(textToEncrypt, publicKey);
    const decryptedText = decryptText(
      encryptedData,
      sharesToPrivateKey(
        await Promise.all(serializedShares.map(deserializeShare)),
      ),
    );
    expect(textToEncrypt).toEqual(decryptedText);
  });
});
