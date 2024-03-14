import React from "react";

import fs from "node:fs/promises";
import { expect, test, describe, afterEach } from "vitest";
import mockfs from "mock-fs";

import chalk from "chalk";
import { face } from "./generate-shares";
import { render } from "../utils/render";
import {
  decryptText,
  encryptText,
  parsePrivateKey,
  parsePublicKey,
} from "../utils/crypto";
import { combineShares, deserializeShare } from "../utils/shares";

afterEach(() => {
  mockfs.restore();
});

const PUBLIC_KEY_LENGTH = 360;
const SHARE_PREFIX_LENGTH = 6; // <threshold>|<bits>|<id>
const SHARE_LENGTH = 1600;

const getWithValid = (override: Partial<Record<string, string>>) => ({
  threshold: "2",
  shares: "10",
  pubOutput: "pub.key",
  ...override,
});

describe("validation", () => {
  test("threshold", async () => {
    await expect(() =>
      face.validator(getWithValid({ threshold: "a" })),
    ).rejects.toThrow(
      "Error parsing threshold value: Invalid type: Expected number but received NaN",
    );
    expect(await face.validator(getWithValid({ threshold: "1" }))).toEqual({
      threshold: 2,
      shares: 10,
      pubKeyFilePath: "pub.key",
    });
    expect(await face.validator(getWithValid({ threshold: "2" }))).toEqual({
      threshold: 2,
      shares: 10,
      pubKeyFilePath: "pub.key",
    });
  });

  test("shares", async () => {
    await expect(() =>
      face.validator(getWithValid({ shares: "a" })),
    ).rejects.toThrow(
      "Error parsing shares value: Invalid type: Expected number but received NaN",
    );
    await expect(() =>
      face.validator(getWithValid({ shares: "1" })),
    ).rejects.toThrow(
      'Scheme 2 out of 2 cannot be generated: "k" should be less than "n"',
    );
    await expect(() =>
      face.validator(getWithValid({ threshold: "3", shares: "3" })),
    ).rejects.toThrow(
      'Scheme 3 out of 3 cannot be generated: "k" should be less than "n"',
    );
    expect(await face.validator(getWithValid({ shares: "3" }))).toEqual({
      threshold: 2,
      shares: 3,
      pubKeyFilePath: "pub.key",
    });
  });

  test("public key output", async () => {
    const dirPath = "path/to/dir";
    mockfs({ [dirPath]: {} });
    await expect(() =>
      face.validator(getWithValid({ pubOutput: dirPath })),
    ).rejects.toThrow("Public key path should not be a directory.");
    const outsideDirPath = "../foo.key";
    await expect(() =>
      face.validator(getWithValid({ pubOutput: outsideDirPath })),
    ).rejects.toThrow("Public key only can be written in a current directory.");
    expect(
      await face.validator(getWithValid({ pubOutput: "pub.key" })),
    ).toEqual({ threshold: 2, shares: 10, pubKeyFilePath: "pub.key" });
    expect(
      await face.validator(getWithValid({ pubOutput: undefined })),
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
    mockfs({});
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

    const textToEncrypt = Buffer.from("Hello world\nNext line please");
    const encryptedText = encryptText(
      textToEncrypt,
      parsePublicKey(Buffer.from(publicKeyBlock)),
    );
    const decryptedText = decryptText(
      encryptedText,
      parsePrivateKey(
        Buffer.from(
          combineShares(serializedShares.map(deserializeShare)),
          "hex",
        ),
      ),
    );
    expect(textToEncrypt.toString()).toEqual(decryptedText.toString());
  });
});
