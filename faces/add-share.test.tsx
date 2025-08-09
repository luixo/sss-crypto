import React from "react";

import { test, describe, expect } from "vitest";
import chalk from "chalk";

import { face } from "./add-share";
import { decryptText, encryptText, generatePair } from "../utils/crypto";
import { deserializeShare, serializeShare } from "../utils/shares";
import { render } from "../utils/render";
import { sequence } from "../utils/promise";
import { pickRandom } from "../utils/array";
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
      }).map((share) =>
        serializeShare({
          ...share,
          data: Buffer.from(
            Buffer.from(share.data, "base64").toString("hex").slice(0, -10),
            "hex",
          ).toString("base64"),
        }),
      );

      const { expectOutput, stdin } = await render(<face.Component />);
      stdin.writeLn(privateKeyShares[0]);
      expectOutput(
        "Please input share #1",
        chalk.green("(input of length 1602)"),
        "Error: Share format is incorrect",
      );
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

      const { expectOutput, stdin } = await render(<face.Component />);
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

      const { expectOutput, stdin } = await render(<face.Component />);
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
        const { expectOutput, stdin } = await render(<face.Component />);
        const corruptedShare = "3|05|anything";
        await stdin.writeLn(corruptedShare);
        expectOutput(
          "Please input share #1",
          chalk.green(`(input of length ${corruptedShare.length})`),
          chalk.red("Error: Share format is incorrect"),
        );
      });

      test("no delimiters", async () => {
        const { expectOutput, stdin } = await render(<face.Component />);
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
      const { privateKey } = generatePair();
      const privateKeyShares = privateKeyToShares(privateKey, {
        threshold: 3,
        shares: 5,
      }).map((share, index) =>
        serializeShare({ ...share, threshold: share.threshold + index }),
      );

      const { expectOutput, stdin } = await render(<face.Component />);
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
    const { expectOutput, stdin } = await render(<face.Component />);
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
    const { expectOutput, stdin } = await render(<face.Component />);
    const s = serializeShare({
      threshold,
      bits: 8,
      id: 1,
      data: Buffer.from("a".repeat(SHARE_LENGTH * 0.75)).toString("base64"),
    });
    await stdin.writeLn(s);
    expectOutput(
      "Input share #1 registered.",
      `Please input share #2 (out of ${threshold})`,
      chalk.red("(no input)"),
    );
  });

  test("shares registration displayed properly", async () => {
    const threshold = 5 + Math.floor(Math.random() * 10);
    const { expectOutput, stdin } = await render(<face.Component />);
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

  test("adding share handled successfully", async () => {
    const { privateKey } = generatePair();
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

    const { stdin, lastFrame } = await render(<face.Component />);
    await sequence(
      ...privateKeyShares
        .slice(0, threshold)
        .map((privateKeyShare) => () => stdin.writeLn(privateKeyShare)),
    );
    const [warningBlock, ...sharesBlocks] = lastFrame()!
      .split("\n\n")
      .map((str) => str.trim())
      .filter(Boolean);
    expect(warningBlock).toEqual(
      chalk.yellow(
        "! Save this data, it will be erased when you close the terminal !",
      ),
    );
    expect(sharesBlocks).toHaveLength(1);
    sharesBlocks.forEach((shareBlock, index) => {
      const serializedShare = shareBlock.split("\n").slice(1);
      expect(serializedShare.join("")).toHaveLength(
        SHARE_LENGTH + SHARE_PREFIX_LENGTH,
      );
      expect(shareBlock).toEqual(
        [
          chalk.green(`Share #${threshold + index + 1}`),
          ...serializedShare,
        ].join("\n"),
      );
    });
  });

  test("new shares can decrypt the data", async () => {
    const { privateKey, publicKey } = generatePair();
    const threshold = 3;
    const privateKeyShares = privateKeyToShares(privateKey, {
      threshold,
      shares: 5,
    }).map(serializeShare);

    const { stdin, lastFrame } = await render(<face.Component />);
    await sequence(
      ...privateKeyShares
        .slice(0, threshold)
        .map((privateKeyShare) => () => stdin.writeLn(privateKeyShare)),
    );

    const [, lastBlock] = lastFrame()!
      .split("\n\n")
      .map((str) => str.trim())
      .filter(Boolean);
    const serializedShares = [
      ...privateKeyShares.slice(0, threshold - 1),
      lastBlock.split("\n").slice(1).join(""),
    ];

    const textToEncrypt = "Hello world\nNext line please";
    const encryptedData = encryptText(textToEncrypt, publicKey);
    const decryptedText = decryptText(
      encryptedData,
      sharesToPrivateKey(serializedShares.map(deserializeShare)),
    );
    expect(textToEncrypt).toEqual(decryptedText);
  });
});
