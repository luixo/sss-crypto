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
    const { lastFrame } = await render(
      <face.Component threshold={3} shares={sharesAmount} />,
    );
    const [warningBlock, publicKeyBlock, ...sharesBlocks] = lastFrame()!
      .split("\n\n")
      .map((str) => str.trim())
      .filter(Boolean);
    expect(warningBlock).toEqual(
      chalk.yellow(
        "! Save this data, it will be erased when you close the terminal !",
      ),
    );
    const publicKey = publicKeyBlock.split("\n").slice(2, -1);
    expect(publicKey.join("")).toHaveLength(PUBLIC_KEY_LENGTH);
    expect(publicKeyBlock).toEqual(
      [
        chalk.cyan("Public key"),
        "-----BEGIN RSA PUBLIC KEY-----",
        ...publicKey,
        "-----END RSA PUBLIC KEY-----",
      ].join("\n"),
    );
    expect(sharesBlocks).toHaveLength(sharesAmount);
    sharesBlocks.forEach((shareBlock, index) => {
      const serializedShare = shareBlock.split("\n").slice(1);
      expect(serializedShare.join("")).toHaveLength(
        SHARE_LENGTH + SHARE_PREFIX_LENGTH,
      );
      expect(shareBlock).toEqual(
        [chalk.green(`Share #${index + 1}`), ...serializedShare].join("\n"),
      );
    });
  });

  test("with pub key file path", async () => {
    const pubKeyPath = "pub.key";
    const sharesAmount = 5;
    const { lastFrame } = await render(
      <face.Component
        threshold={3}
        shares={sharesAmount}
        pubKeyFilePath={pubKeyPath}
      />,
    );
    const [warningBlock, publicKeyBlock, ...sharesBlocks] = lastFrame()!
      .split("\n\n")
      .map((str) => str.trim())
      .filter(Boolean);
    expect(warningBlock).toEqual(
      chalk.yellow(
        "! Save this data, it will be erased when you close the terminal !",
      ),
    );
    expect(publicKeyBlock).toEqual(
      chalk.green(`Public key is saved to "${pubKeyPath}"`),
    );
    expect(sharesBlocks).toHaveLength(sharesAmount);
    sharesBlocks.forEach((shareBlock, index) => {
      const serializedShare = shareBlock.split("\n").slice(1);
      expect(serializedShare.join("")).toHaveLength(
        SHARE_LENGTH + SHARE_PREFIX_LENGTH,
      );
      expect(shareBlock).toEqual(
        [chalk.green(`Share #${index + 1}`), ...serializedShare].join("\n"),
      );
    });
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
    const { lastFrame } = await render(
      <face.Component threshold={3} shares={sharesAmount} />,
    );

    const [, publicKeyBlock, ...sharesBlocks] = lastFrame()!
      .split("\n\n")
      .map((str) => str.trim())
      .filter(Boolean);
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
      sharesToPrivateKey(serializedShares.map(deserializeShare)),
    );
    expect(textToEncrypt).toEqual(decryptedText);
  });
});
