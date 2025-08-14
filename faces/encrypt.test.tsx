import { expect, test, describe } from "vitest";
import fs from "node:fs/promises";
import chalk from "chalk";
import stripAnsi from "strip-ansi";

import { face } from "./encrypt";
import { render } from "../utils/render";
import { decryptText, generatePair, encryptedBoxSchema } from "../utils/crypto";
import { keyToPem } from "../utils/encoding";
import { mapArgErrors, validate } from "../utils/validation";

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

describe("validation", () => {
  describe("pub key file", () => {
    test("file does not exist", async () => {
      await expect(async () =>
        validate(face.schema, { pub: "non-existent" }, mapArgErrors),
      ).rejects.toThrow('Arg "pub" error: Path "non-existent" does not exist.');
    });

    test("target is a directory", async () => {
      const dirPath = "path/to/dir";
      fs.mkdir(dirPath, { recursive: true });
      await expect(async () =>
        validate(face.schema, { pub: dirPath }, mapArgErrors),
      ).rejects.toThrow('Arg "pub" error: File "path/to/dir" is not a file.');
    });

    test("public key data is invalid", async () => {
      const publicKeyData = "This is not a public key";
      const pubKeyPath = "path/to/pub.key";
      await fs.writeFile(pubKeyPath, publicKeyData);
      await expect(async () =>
        validate(face.schema, { pub: pubKeyPath }, mapArgErrors),
      ).rejects.toThrow("Can't read public key, probably data is corrupted.");
    });
  });

  describe("input file", () => {
    test("file does not exist", async () => {
      const pubKeyPath = "path/to/pub.key";
      const { publicKey } = await generatePair();
      await fs.writeFile(pubKeyPath, keyToPem(publicKey));
      await expect(async () =>
        validate(
          face.schema,
          { pub: pubKeyPath, input: "non-existent" },
          mapArgErrors,
        ),
      ).rejects.toThrow(
        'Arg "input" error: Path "non-existent" does not exist.',
      );
    });

    test("target is a directory", async () => {
      const pubKeyPath = "path/to/pub.key";
      const { publicKey } = await generatePair();
      await fs.writeFile(pubKeyPath, keyToPem(publicKey));
      const dirPath = "path/to/dir";
      await fs.mkdir(dirPath, { recursive: true });
      await expect(async () =>
        validate(
          face.schema,
          { pub: pubKeyPath, input: dirPath },
          mapArgErrors,
        ),
      ).rejects.toThrow('Arg "input" error: File "path/to/dir" is not a file.');
    });
  });

  test("successful validation", async () => {
    const { publicKey } = await generatePair();
    const pubKeyPath = "path/to/pub.key";
    const inputPath = "path/to/input.txt";
    const inputToEncrypt = "input to encrypt";
    await fs.writeFile(pubKeyPath, keyToPem(publicKey));
    await fs.writeFile(inputPath, inputToEncrypt);
    const { publicKey: parsedPublicKey, input } = await validate(
      face.schema,
      {
        pub: pubKeyPath,
        input: inputPath,
      },
      mapArgErrors,
    );
    expect(keyToPem(publicKey)).toEqual(keyToPem(parsedPublicKey));
    expect(input).toEqual(inputToEncrypt);
  });
});

describe("encryption", () => {
  test("input properly displayed", async () => {
    const { publicKey } = await generatePair();
    const { lastFrameLines, stdin } = await render(
      <face.Component publicKey={publicKey} />,
    );

    const expectLastLine = async (lastLine: string) =>
      expect
        .poll(lastFrameLines)
        .toEqual(["Please input text to encrypt:", lastLine]);

    await expectLastLine(chalk.red("(no input)"));
    await stdin.write("1");
    await expectLastLine(chalk.green("1"));
    await stdin.write("11");
    await expectLastLine(chalk.green("111"));
    await stdin.backspace();
    await expectLastLine(chalk.green("11"));
  });

  describe("text is encrypted", () => {
    test("provided externally", async () => {
      const textToEncrypt = "Hello world";
      const { publicKey, privateKey } = await generatePair();
      const { lastFrameLines } = await render(
        <face.Component input={textToEncrypt} publicKey={publicKey} />,
      );
      const [, ...encryptedText] = lastFrameLines();
      const encryptedData = await validate(
        encryptedBoxSchema,
        encryptedText.join(""),
      );
      await expect
        .poll(lastFrameLines)
        .toEqual(["Encryption result:", ...encryptedText]);
      expect(decryptText(encryptedData, privateKey)).toEqual(textToEncrypt);
    });

    test("provided manually", async () => {
      const textToEncrypt = "Hello world";
      const { publicKey, privateKey } = await generatePair();
      const { lastFrameLines, stdin } = await render(
        <face.Component publicKey={publicKey} />,
      );
      await expect
        .poll(lastFrameLines)
        .toEqual(["Please input text to encrypt:", chalk.red("(no input)")]);
      await stdin.enter();
      await expect
        .poll(lastFrameLines)
        .toEqual(["Please input text to encrypt:", chalk.red("(no input)")]);
      await stdin.writeLn(textToEncrypt);
      const [, ...encryptedText] = lastFrameLines();
      const encryptedData = await validate(
        encryptedBoxSchema,
        encryptedText.join(""),
      );
      await expect
        .poll(lastFrameLines)
        .toEqual(["Encryption result:", ...encryptedText]);
      expect(decryptText(encryptedData, privateKey)).toEqual(textToEncrypt);
    });

    test("long text", async () => {
      const array = new Uint8Array(10 * 1024);
      const textToEncrypt = new TextDecoder().decode(
        crypto.getRandomValues(array).buffer,
      );
      const { publicKey, privateKey } = await generatePair();
      const { lastFrameLines, stdin } = await render(
        <face.Component publicKey={publicKey} />,
      );
      await expect
        .poll(lastFrameLines)
        .toEqual(["Please input text to encrypt:", chalk.red("(no input)")]);
      await stdin.enter();
      await expect
        .poll(lastFrameLines)
        .toEqual(["Please input text to encrypt:", chalk.red("(no input)")]);
      await stdin.writeLn(textToEncrypt);
      await stdin.enter();
      await expect
        .poll(() => lastFrameLines().at(0))
        .toEqual("Encryption result:");
      const encryptedData = await validate(
        encryptedBoxSchema,
        lastFrameLines().slice(1).join(""),
      );
      expect(decryptText(encryptedData, privateKey)).toEqual(textToEncrypt);
    });
  });

  describe("working with templates", () => {
    test("templates are substituted", async () => {
      const textToEncrypt =
        "Hello <% enter your name %>, this is <% enter other name %> and welcome!";
      const { publicKey, privateKey } = await generatePair();
      const { lastFrameLines, stdin } = await render(
        <face.Component input={textToEncrypt} publicKey={publicKey} />,
      );
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "+--------------------------------------------------------------------------------------------------+",
          "|Hello <% enter your name %>, this is ...                                                          |",
          "+--------------------------------------------------------------------------------------------------+",
          "Please input a substitute:",
          chalk.red("(no input)"),
        ]);
      await stdin.write("A");
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "+--------------------------------------------------------------------------------------------------+",
          "|Hello <% enter your name %>, this is ...                                                          |",
          "+--------------------------------------------------------------------------------------------------+",
          "Please input a substitute:",
          chalk.green("A"),
        ]);
      await stdin.writeLn("lice");
      await stdin.writeLn("Bob");
      const actual = lastFrameLines().slice(1).join("");
      const encryptedData = await validate(encryptedBoxSchema, actual);
      expect(decryptText(encryptedData, privateKey)).toEqual(
        textToEncrypt
          .replace("<% enter your name %>", "Alice")
          .replace("<% enter other name %>", "Bob"),
      );
    });

    test("substitute input interaction", async () => {
      const textToEncrypt =
        "Hello <% enter your name %>, this is <% enter other name %> and <% what should we say? %>!";
      const { publicKey } = await generatePair();
      const { lastFrameLines, stdin, stdout } = await render(
        <face.Component input={textToEncrypt} publicKey={publicKey} />,
      );
      await expect
        .poll(lastFrameLines)
        .toEqual([
          ...withBox(
            `Hello ${chalk.green("<% enter your name %>")}, this is ...`,
            stdout.columns,
          ),
          "Please input a substitute:",
          chalk.red("(no input)"),
        ]);
      await stdin.writeLn("Alice");
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "✔️  [enter your name -> 5 symbol(s)]",
          ...withBox(
            `..., this is ${chalk.green("<% enter other name %>")} and <% wh...`,
            stdout.columns,
          ),
          "Please input a substitute:",
          chalk.red("(no input)"),
        ]);
      await stdin.writeLn("Bob");
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "✔️  [enter your name -> 5 symbol(s)]",
          "✔️  [enter other name -> 3 symbol(s)]",
          ...withBox(
            `...me %> and ${chalk.green("<% what should we say? %>")}`,
            stdout.columns,
          ),
          "Please input a substitute:",
          chalk.red("(no input)"),
        ]);
    });

    test("border case without dots", async () => {
      const textToEncrypt = "<% start %> and <% end %>";
      const { publicKey } = await generatePair();
      const { lastFrameLines, stdin, stdout } = await render(
        <face.Component input={textToEncrypt} publicKey={publicKey} />,
      );
      await expect
        .poll(lastFrameLines)
        .toEqual([
          ...withBox(
            `${chalk.green("<% start %>")} and <% en...`,
            stdout.columns,
          ),
          "Please input a substitute:",
          chalk.red("(no input)"),
        ]);
      await stdin.writeLn("Alice");
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "✔️  [start -> 5 symbol(s)]",
          ...withBox(
            `...rt %> and ${chalk.green("<% end %>")}`,
            stdout.columns,
          ),
          "Please input a substitute:",
          chalk.red("(no input)"),
        ]);
    });

    test("arrows work to navigate substitutes", async () => {
      const textToEncrypt =
        "Hello <% enter your name %>, this is <% enter other name %> and <% what should we say? %>!";
      const { publicKey } = await generatePair();
      const { lastFrameLines, stdin, stdout } = await render(
        <face.Component input={textToEncrypt} publicKey={publicKey} />,
      );
      await stdin.writeLn("Alice");
      await stdin.writeLn("Bob");
      await stdin.write("Charlie");

      // Can move around frames
      await stdin.leftArrow();
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "✔️  [enter your name -> 5 symbol(s)]",
          chalk.green("✔️  [enter other name -> 3 symbol(s)]"),
          "✔️  [what should we say? -> 7 symbol(s)]",
          ...withBox(
            `..., this is ${chalk.green("<% enter other name %>")} and <% wh...`,
            stdout.columns,
          ),
          "Please input a substitute:",
          chalk.green("Bob"),
        ]);
      await stdin.rightArrow();
      await expect
        .poll(lastFrameLines)
        .toEqual([
          "✔️  [enter your name -> 5 symbol(s)]",
          "✔️  [enter other name -> 3 symbol(s)]",
          chalk.green("✔️  [what should we say? -> 7 symbol(s)]"),
          ...withBox(
            `...me %> and ${chalk.green("<% what should we say? %>")}`,
            stdout.columns,
          ),
          "Please input a substitute:",
          chalk.green("Charlie"),
        ]);

      // Can't go before 1st frame
      await stdin.leftArrow();
      await stdin.leftArrow();
      const firstFrame = lastFrameLines();
      await stdin.leftArrow();
      expect(firstFrame).toEqual(lastFrameLines());

      await stdin.rightArrow();

      // Can't go after last frame (said not all frame are fulfilled)
      await stdin.rightArrow();
      await stdin.backspace(7);
      await stdin.rightArrow();
      const thirdFrame = lastFrameLines();
      await stdin.rightArrow();
      expect(thirdFrame).toEqual(lastFrameLines());

      await stdin.write("Charlie");
      await stdin.rightArrow();
      await expect
        .poll(() => {
          const lines = lastFrameLines();
          return lines.slice(0, 1);
        })
        .toEqual(["Encryption result:"]);
    });
  });
});
