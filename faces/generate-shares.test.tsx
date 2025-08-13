import React from "react";

import fs from "node:fs/promises";
import { expect, test, describe } from "vitest";

import chalk from "chalk";
import { face } from "./generate-shares";
import { render } from "../utils/render";
import { decryptText, encryptText, parsePublicKey } from "../utils/crypto";
import { deserializeShare } from "../utils/shares";
import {
  PUBLIC_KEY_LENGTH,
  SHARE_LENGTH,
  SHARE_PREFIX_LENGTH,
} from "../utils/consts";
import { sharesToPrivateKey } from "../utils/converters";
import { validate } from "../utils/validation";

const getWithValid = (override: Partial<Record<string, string>> = {}) => ({
  threshold: "2",
  shares: "10",
  pubOutput: "pub.key",
  ...override,
});

describe("validation", () => {
  test("threshold", async () => {
    await expect(() =>
      validate(face.schema, getWithValid({ threshold: "a" })),
    ).rejects.toThrow(
      'At "threshold": Invalid input: expected number, received NaN',
    );
    expect(
      await validate(face.schema, getWithValid({ threshold: "2" })),
    ).toEqual({
      threshold: 2,
      shares: 10,
      pubKeyFilePath: "pub.key",
    });
  });

  test("shares", async () => {
    await expect(() =>
      validate(face.schema, getWithValid({ shares: "a" })),
    ).rejects.toThrow(
      'At "shares": Invalid input: expected number, received NaN',
    );
    await expect(() =>
      validate(face.schema, getWithValid({ threshold: "3", shares: "3" })),
    ).rejects.toThrow(`At "<root>": 'k' should be less than 'n'.`);
    expect(await validate(face.schema, getWithValid({ shares: "3" }))).toEqual({
      threshold: 2,
      shares: 3,
      pubKeyFilePath: "pub.key",
    });
  });

  test("public key output", async () => {
    const dirPath = "path/to/dir";
    fs.mkdir(dirPath, { recursive: true });
    await expect(() =>
      validate(face.schema, getWithValid({ pubOutput: dirPath })),
    ).rejects.toThrow("Public key path should not be a directory.");
    const outsideDirPath = "../foo.key";
    await expect(() =>
      validate(face.schema, getWithValid({ pubOutput: outsideDirPath })),
    ).rejects.toThrow("Public key only can be written in a current directory.");
    await fs.writeFile("pub2.key", "output");
    expect(
      await validate(face.schema, getWithValid({ pubOutput: "pub2.key" })),
    ).toEqual({ threshold: 2, shares: 10, pubKeyFilePath: "pub2.key" });
    expect(
      await validate(face.schema, getWithValid({ pubOutput: undefined })),
    ).toEqual({ threshold: 2, shares: 10, pubKeyFilePath: undefined });
  });
});

describe("shares generation", () => {
  test("no pub key file path", async () => {
    const sharesAmount = 5;
    const { lastFrameLines } = await render(
      <face.Component threshold={3} shares={sharesAmount} />,
    );
    await expect
      .poll(() => {
        const [warningBlock, publicKeyBlock, ...sharesBlock] =
          lastFrameLines("\n\n");
        const publicKeyLines = publicKeyBlock.split("\n");
        const publicKeyLength = publicKeyLines
          .slice(2, -1)
          .reduce((acc, line) => acc + line.length, 0);
        return [
          warningBlock,
          [
            ...publicKeyLines.slice(0, 2),
            publicKeyLength,
            ...publicKeyLines.slice(-1),
          ].join("\n"),
          ...sharesBlock.map((shareBlock) => {
            const lines = shareBlock.split("\n");
            if (lines[0].includes("Share #")) {
              return [
                ...lines.slice(0, 1),
                `share: ${lines.slice(1).reduce((acc, line) => acc + line.length, 0)}`,
              ];
            }
            return lines;
          }),
        ];
      })
      .toEqual([
        chalk.yellow(
          "! Save this data, it will be erased when you close the terminal !",
        ),
        [
          chalk.cyan("Public key"),
          "-----BEGIN RSA PUBLIC KEY-----",
          PUBLIC_KEY_LENGTH,
          "-----END RSA PUBLIC KEY-----",
        ].join("\n"),
        ...Array.from({ length: sharesAmount }).map((_, index) => [
          chalk.green(`Share #${index + 1}`),
          `share: ${SHARE_LENGTH + SHARE_PREFIX_LENGTH}`,
        ]),
      ]);
  });

  test("with pub key file path", async () => {
    const pubKeyPath = "pub.key";
    const sharesAmount = 5;
    const { lastFrameLines } = await render(
      <face.Component
        threshold={3}
        shares={sharesAmount}
        pubKeyFilePath={pubKeyPath}
      />,
    );
    await expect
      .poll(() => {
        const [warningBlock, publicKeyBlock, ...sharesBlock] =
          lastFrameLines("\n\n");
        return [
          warningBlock,
          publicKeyBlock,
          ...sharesBlock.map((shareBlock) => {
            const lines = shareBlock.split("\n");
            if (lines[0].includes("Share #")) {
              return [
                ...lines.slice(0, 1),
                `share: ${lines.slice(1).reduce((acc, line) => acc + line.length, 0)}`,
              ];
            }
            return lines;
          }),
        ];
      })
      .toEqual([
        chalk.yellow(
          "! Save this data, it will be erased when you close the terminal !",
        ),
        chalk.green(`Public key is saved to "${pubKeyPath}"`),
        ...Array.from({ length: sharesAmount }).map((_, index) => [
          chalk.green(`Share #${index + 1}`),
          `share: ${SHARE_LENGTH + SHARE_PREFIX_LENGTH}`,
        ]),
      ]);
    const publicKeyResult = (await fs.readFile("pub.key")).toString("utf-8");
    const publicKey = publicKeyResult.split("\n").slice(1, -2);
    expect(publicKey.join("")).toHaveLength(PUBLIC_KEY_LENGTH);
    expect(publicKeyResult).toEqual(
      [
        "-----BEGIN RSA PUBLIC KEY-----",
        ...publicKey,
        "-----END RSA PUBLIC KEY-----",
        "",
      ].join("\n"),
    );
  });

  test("verify shares can decrypt data", async () => {
    const sharesAmount = 5;
    const { lastFrameLines } = await render(
      <face.Component threshold={3} shares={sharesAmount} />,
    );

    const [, publicKeyBlock, ...sharesBlocks] = lastFrameLines("\n\n");
    const serializedShares = sharesBlocks.map((shareBlock) =>
      shareBlock.split("\n").slice(1).join(""),
    );

    const textToEncrypt = "Hello world\nNext line please";
    const encryptedData = encryptText(
      textToEncrypt,
      parsePublicKey(Buffer.from(publicKeyBlock)),
    );
    const decryptedText = decryptText(
      encryptedData,
      sharesToPrivateKey(
        await Promise.all(serializedShares.map(deserializeShare)),
      ),
    );
    expect(textToEncrypt).toEqual(decryptedText);
  });
});
