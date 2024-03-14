import React from "react";

import { expect, test, describe, afterEach } from "vitest";
import mockfs from "mock-fs";

import chalk from "chalk";
import { face } from "./encrypt";
import { render } from "../utils/render";
import { decryptText, generatePair } from "../utils/crypto";
import { keyToPem } from "../utils/encoding";

afterEach(() => {
  mockfs.restore();
});

describe("validation", () => {
  test("file does not exist", async () => {
    expect(() => face.validator("", { pub: "non-existent" })).rejects.toThrow(
      'Public key at "non-existent" does not exist.',
    );
  });

  test("target is a directory", async () => {
    const dirPath = "path/to/dir";
    mockfs({ [dirPath]: {} });
    expect(() => face.validator("", { pub: dirPath })).rejects.toThrow(
      'Public key at "path/to/dir" is not a file.',
    );
  });

  test("public key data is invalid", async () => {
    const publicKeyData = "This is not a public key";
    const filePath = "path/to/pub.key";
    mockfs({ [filePath]: publicKeyData });
    expect(() => face.validator("", { pub: filePath })).rejects.toThrow(
      "Can't read public key, probably data is corrupted.",
    );
  });

  test("successful validation", async () => {
    const { publicKey } = generatePair();
    const filePath = "path/to/pub.key";
    mockfs({ [filePath]: keyToPem(publicKey) });
    const { publicKey: parsedPublicKey } = await face.validator("", {
      pub: filePath,
    });
    expect(keyToPem(publicKey)).toEqual(keyToPem(parsedPublicKey));
  });
});

describe("encryption", () => {
  test("input properly displayed", async () => {
    const { publicKey } = generatePair();
    const { expectOutput, stdin } = await render(
      <face.Component publicKey={publicKey} input="" />,
    );
    expectOutput("Please input text to encrypt:");
    await stdin.write("1");
    expectOutput("Please input text to encrypt:", chalk.green("1"));
    await stdin.write("11");
    expectOutput("Please input text to encrypt:", chalk.green("111"));
    await stdin.backspace();
    expectOutput("Please input text to encrypt:", chalk.green("11"));
  });

  describe("text is encrypted", () => {
    test("provided via stdin", async () => {
      const textToEncrypt = "Hello world";
      const { publicKey, privateKey } = generatePair();
      const { expectOutput, lastFrame } = await render(
        <face.Component publicKey={publicKey} input={textToEncrypt} />,
      );
      const [, ...encryptedText] = lastFrame()!.split("\n");
      expect(encryptedText.join("")).toHaveLength(344);
      expectOutput("Encryption result:", ...encryptedText);
      // We have to decrypt text back as encryptText() is not stable by design
      // see https://stackoverflow.com/questions/57779904/
      expect(
        decryptText(
          Buffer.from(encryptedText.join(""), "base64"),
          privateKey,
        ).toString(),
      ).toEqual(textToEncrypt);
    });

    test("provided manually", async () => {
      const textToEncrypt = "Hello world";
      const { publicKey, privateKey } = generatePair();
      const { expectOutput, lastFrame, stdin } = await render(
        <face.Component publicKey={publicKey} input="" />,
      );
      expectOutput("Please input text to encrypt:");
      await stdin.enter();
      expectOutput("Please input text to encrypt:");
      await stdin.writeLn(textToEncrypt);
      const [, ...encryptedText] = lastFrame()!.split("\n");
      expect(encryptedText.join("")).toHaveLength(344);
      expectOutput("Encryption result:", ...encryptedText);
      // We have to decrypt text back as encryptText() is not stable by design
      // see https://stackoverflow.com/questions/57779904/
      expect(
        decryptText(
          Buffer.from(encryptedText.join(""), "base64"),
          privateKey,
        ).toString(),
      ).toEqual(textToEncrypt);
    });
  });
});
