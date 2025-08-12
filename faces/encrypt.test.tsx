import React from "react";

import { expect, test, describe, afterEach } from "vitest";
import mockfs from "mock-fs";
import chalk from "chalk";
import stripAnsi from "strip-ansi";

import { face } from "./encrypt";
import { render } from "../utils/render";
import {
  decryptText,
  generatePair,
  deserializeEncryptedData,
} from "../utils/crypto";
import { keyToPem } from "../utils/encoding";
import { validate } from "../utils/validation";

const padEndChalked = (
  text: string,
  targetLength: number,
  fillString: string,
) => {
  const actualLength = stripAnsi(text).length;
  return `${text}${fillString.repeat((targetLength - actualLength) / fillString.length)}`;
};

const withBox = (text: string, width: number) => [
  `+${"".padEnd(width - 2, "-")}+`,
  `|${padEndChalked(text, width - 2, " ")}|`,
  `+${"".padEnd(width - 2, "-")}+`,
];

afterEach(() => {
  mockfs.restore();
});

describe("validation", () => {
  describe("pub key file", () => {
    test("file does not exist", async () => {
      expect(() =>
        validate(face.schema, { pub: "non-existent" }),
      ).rejects.toThrow('At "pub": Path "non-existent" does not exist.');
    });

    test("target is a directory", async () => {
      const dirPath = "path/to/dir";
      mockfs({ [dirPath]: {} });
      expect(() => validate(face.schema, { pub: dirPath })).rejects.toThrow(
        'At "pub": File "path/to/dir" is not a file.',
      );
    });

    test("public key data is invalid", async () => {
      const publicKeyData = "This is not a public key";
      const pubKeyPath = "path/to/pub.key";
      mockfs({ [pubKeyPath]: publicKeyData });
      expect(() => validate(face.schema, { pub: pubKeyPath })).rejects.toThrow(
        "Can't read public key, probably data is corrupted.",
      );
    });
  });

  describe("input file", () => {
    test("file does not exist", async () => {
      const pubKeyPath = "path/to/pub.key";
      mockfs({ [pubKeyPath]: "" });
      expect(() =>
        validate(face.schema, { pub: pubKeyPath, input: "non-existent" }),
      ).rejects.toThrow('At "input": Path "non-existent" does not exist.');
    });

    test("target is a directory", async () => {
      const pubKeyPath = "path/to/pub.key";
      const dirPath = "path/to/dir";
      mockfs({ [pubKeyPath]: "", [dirPath]: {} });
      expect(() =>
        validate(face.schema, { pub: pubKeyPath, input: dirPath }),
      ).rejects.toThrow('At "input": File "path/to/dir" is not a file.');
    });
  });

  test("successful validation", async () => {
    const { publicKey } = generatePair();
    const pubKeyPath = "path/to/pub.key";
    const inputPath = "path/to/input.txt";
    const inputToEncrypt = "input to encrypt";
    mockfs({ [pubKeyPath]: keyToPem(publicKey), [inputPath]: inputToEncrypt });
    const { publicKey: parsedPublicKey, input } = await validate(face.schema, {
      pub: pubKeyPath,
      input: inputPath,
    });
    expect(keyToPem(publicKey)).toEqual(keyToPem(parsedPublicKey));
    expect(input).toEqual(inputToEncrypt);
  });
});

describe("encryption", () => {
  test("input properly displayed", async () => {
    const { publicKey } = generatePair();
    const { expectOutput, stdin } = await render(
      <face.Component publicKey={publicKey} />,
    );
    expectOutput("Please input text to encrypt:", chalk.red("(no input)"));
    await stdin.write("1");
    expectOutput("Please input text to encrypt:", chalk.green("1"));
    await stdin.write("11");
    expectOutput("Please input text to encrypt:", chalk.green("111"));
    await stdin.backspace();
    expectOutput("Please input text to encrypt:", chalk.green("11"));
  });

  describe("text is encrypted", () => {
    test("provided externally", async () => {
      const textToEncrypt = "Hello world";
      const { publicKey, privateKey } = generatePair();
      const { expectOutput, lastFrame } = await render(
        <face.Component publicKey={publicKey} input={textToEncrypt} />,
      );
      const [, ...encryptedText] = lastFrame()!.split("\n");
      const encryptedData = deserializeEncryptedData(encryptedText.join(""));
      expectOutput("Encryption result:", ...encryptedText);
      expect(decryptText(encryptedData, privateKey)).toEqual(textToEncrypt);
    });

    test("provided manually", async () => {
      const textToEncrypt = "Hello world";
      const { publicKey, privateKey } = generatePair();
      const { expectOutput, lastFrame, stdin } = await render(
        <face.Component publicKey={publicKey} />,
      );
      expectOutput("Please input text to encrypt:", chalk.red("(no input)"));
      await stdin.enter();
      expectOutput("Please input text to encrypt:", chalk.red("(no input)"));
      await stdin.writeLn(textToEncrypt);
      const [, ...encryptedText] = lastFrame()!.split("\n");
      const encryptedData = deserializeEncryptedData(encryptedText.join(""));
      expectOutput("Encryption result:", ...encryptedText);
      expect(decryptText(encryptedData, privateKey)).toEqual(textToEncrypt);
    });

    test("long text", async () => {
      const array = new Uint8Array(10 * 1024);
      const textToEncrypt = new TextDecoder().decode(
        crypto.getRandomValues(array).buffer,
      );
      const { publicKey, privateKey } = generatePair();
      const { expectOutput, lastFrame, stdin } = await render(
        <face.Component publicKey={publicKey} />,
      );
      expectOutput("Please input text to encrypt:", chalk.red("(no input)"));
      await stdin.enter();
      expectOutput("Please input text to encrypt:", chalk.red("(no input)"));
      await stdin.writeLn(textToEncrypt);
      const [, ...encryptedText] = lastFrame()!.split("\n");
      const encryptedData = deserializeEncryptedData(encryptedText.join(""));
      expectOutput("Encryption result:", ...encryptedText);
      expect(decryptText(encryptedData, privateKey)).toEqual(textToEncrypt);
    });
  });

  describe("working with templates", () => {
    test("templates are substituted", async () => {
      const textToEncrypt =
        "Hello <% enter your name %>, this is <% enter other name %> and welcome!";
      const { publicKey, privateKey } = generatePair();
      const { expectEncrypted, expectOutput, stdin } = await render(
        <face.Component publicKey={publicKey} input={textToEncrypt} />,
      );
      expectOutput(null, null, null, null, chalk.red("(no input)"));
      await stdin.write("A");
      expectOutput(null, null, null, null, chalk.green("A"));
      await stdin.writeLn("lice");
      await stdin.writeLn("Bob");
      expectEncrypted({
        privateKey,
        getEncrypted: (actual) => actual.slice(1).join(""),
        expected: textToEncrypt
          .replace("<% enter your name %>", "Alice")
          .replace("<% enter other name %>", "Bob"),
      });
    });

    test("substitute input interaction", async () => {
      const textToEncrypt =
        "Hello <% enter your name %>, this is <% enter other name %> and <% what should we say? %>!";
      const { publicKey } = generatePair();
      const { expectOutput, stdin, stdout } = await render(
        <face.Component publicKey={publicKey} input={textToEncrypt} />,
      );
      expectOutput(
        ...withBox(
          `Hello ${chalk.green("<% enter your name %>")}, this is ...`,
          stdout.columns,
        ),
        "Please input a substitute:",
        chalk.red("(no input)"),
      );
      await stdin.writeLn("Alice");
      expectOutput(
        "✔️  [enter your name -> 5 symbol(s)]",
        ...withBox(
          `..., this is ${chalk.green("<% enter other name %>")} and <% wh...`,
          stdout.columns,
        ),
        "Please input a substitute:",
        chalk.red("(no input)"),
      );
      await stdin.writeLn("Bob");
      expectOutput(
        "✔️  [enter your name -> 5 symbol(s)]",
        "✔️  [enter other name -> 3 symbol(s)]",
        ...withBox(
          `...me %> and ${chalk.green("<% what should we say? %>")}`,
          stdout.columns,
        ),
        "Please input a substitute:",
        chalk.red("(no input)"),
      );
    });

    test("border case without dots", async () => {
      const textToEncrypt = "<% start %> and <% end %>";
      const { publicKey } = generatePair();
      const { expectOutput, stdin, stdout } = await render(
        <face.Component publicKey={publicKey} input={textToEncrypt} />,
      );
      expectOutput(
        ...withBox(
          `${chalk.green("<% start %>")} and <% en...`,
          stdout.columns,
        ),
        "Please input a substitute:",
        chalk.red("(no input)"),
      );
      await stdin.writeLn("Alice");
      expectOutput(
        "✔️  [start -> 5 symbol(s)]",
        ...withBox(`...rt %> and ${chalk.green("<% end %>")}`, stdout.columns),
        "Please input a substitute:",
        chalk.red("(no input)"),
      );
    });

    test("arrows work to navigate substitutes", async () => {
      const textToEncrypt =
        "Hello <% enter your name %>, this is <% enter other name %> and <% what should we say? %>!";
      const { publicKey } = generatePair();
      const { expectOutput, stdin, stdout, lastFrame } = await render(
        <face.Component publicKey={publicKey} input={textToEncrypt} />,
      );
      await stdin.writeLn("Alice");
      await stdin.writeLn("Bob");
      await stdin.write("Charlie");

      // Can move around frames
      await stdin.leftArrow();
      expectOutput(
        "✔️  [enter your name -> 5 symbol(s)]",
        chalk.green("✔️  [enter other name -> 3 symbol(s)]"),
        "✔️  [what should we say? -> 7 symbol(s)]",
        ...withBox(
          `..., this is ${chalk.green("<% enter other name %>")} and <% wh...`,
          stdout.columns,
        ),
        "Please input a substitute:",
        chalk.green("Bob"),
      );
      await stdin.rightArrow();
      expectOutput(
        "✔️  [enter your name -> 5 symbol(s)]",
        "✔️  [enter other name -> 3 symbol(s)]",
        chalk.green("✔️  [what should we say? -> 7 symbol(s)]"),
        ...withBox(
          `...me %> and ${chalk.green("<% what should we say? %>")}`,
          stdout.columns,
        ),
        "Please input a substitute:",
        chalk.green("Charlie"),
      );

      // Can't go before 1st frame
      await stdin.leftArrow();
      await stdin.leftArrow();
      const firstFrame = lastFrame();
      await stdin.leftArrow();
      expect(firstFrame).toEqual(lastFrame());

      await stdin.rightArrow();

      // Can't go after last frame (said not all frame are fulfilled)
      await stdin.rightArrow();
      await stdin.backspace(7);
      await stdin.rightArrow();
      const thirdFrame = lastFrame();
      await stdin.rightArrow();
      expect(thirdFrame).toEqual(lastFrame());

      await stdin.write("Charlie");
      await stdin.rightArrow();
      expectOutput("Encryption result:", null);
    });
  });
});
