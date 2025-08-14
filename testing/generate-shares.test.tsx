import type React from "react";

import fs from "node:fs/promises";
import { expect, test, describe } from "vitest";

import chalk from "chalk";
import { face } from "~/faces/generate-shares";
import { decryptText, encryptText, parsePublicKey } from "~/utils/crypto";
import { shareObjectSchema } from "~/utils/shares";
import {
  PUBLIC_KEY_LENGTH,
  SHARE_LENGTH,
  SHARE_PREFIX_LENGTH,
} from "~/utils/consts";
import { sharesToPrivateKey } from "~/utils/converters";
import { mapArgErrors, validate } from "~/utils/validation";

import { render } from "./utils/render";

type Props = React.ComponentProps<(typeof face)["Component"]>;

const getWithValid = (override: Partial<Record<string, string>> = {}) => ({
  threshold: "2",
  shares: "10",
  pubOutput: "pub.key",
  ...override,
});

describe("validation", () => {
  test("threshold", async () => {
    await expect(async () =>
      validate(face.schema, getWithValid({ threshold: "a" }), mapArgErrors),
    ).rejects.toThrow(
      'Arg "threshold" error: Invalid input: expected number, received NaN',
    );
    expect(
      await validate(face.schema, getWithValid(), mapArgErrors),
    ).toEqual<Props>({
      threshold: 2,
      shares: 10,
      pubKeyFilePath: "pub.key",
    });
  });

  test("shares", async () => {
    await expect(async () =>
      validate(face.schema, getWithValid({ shares: "a" }), mapArgErrors),
    ).rejects.toThrow(
      'Arg "shares" error: Invalid input: expected number, received NaN',
    );
    await expect(async () =>
      validate(
        face.schema,
        getWithValid({ threshold: "3", shares: "3" }),
        mapArgErrors,
      ),
    ).rejects.toThrow(`Arg "<root>" error: 'k' should be less than 'n'`);
    expect(
      await validate(face.schema, getWithValid({ shares: "3" }), mapArgErrors),
    ).toEqual<Props>({
      threshold: 2,
      shares: 3,
      pubKeyFilePath: "pub.key",
    });
  });

  test("public key output", async () => {
    const dirPath = "path/to/dir";
    fs.mkdir(dirPath, { recursive: true });
    await expect(async () =>
      validate(face.schema, getWithValid({ pubOutput: dirPath }), mapArgErrors),
    ).rejects.toThrow("Public key path should not be a directory.");
    const outsideDirPath = "../foo.key";
    await expect(async () =>
      validate(
        face.schema,
        getWithValid({ pubOutput: outsideDirPath }),
        mapArgErrors,
      ),
    ).rejects.toThrow("Public key only can be written in a current directory.");
    await fs.writeFile("pub2.key", "output");
    expect(
      await validate(
        face.schema,
        getWithValid({ pubOutput: "pub2.key" }),
        mapArgErrors,
      ),
    ).toEqual<Props>({
      threshold: 2,
      shares: 10,
      pubKeyFilePath: "pub2.key",
    });
    expect(
      await validate(
        face.schema,
        getWithValid({ pubOutput: undefined }),
        mapArgErrors,
      ),
    ).toEqual<Props>({
      threshold: 2,
      shares: 10,
      pubKeyFilePath: undefined,
    });
  });
});

describe("shares generation", () => {
  test("no pub key file path", async () => {
    const sharesAmount = 5;
    const { lastFrameLines } = await render(
      <face.Component shares={sharesAmount} threshold={3} />,
    );
    await expect
      .poll(() => {
        const [warningBlock, publicKeyBlock, ...sharesBlock] =
          lastFrameLines("\n\n");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const publicKeyLines = publicKeyBlock!.split("\n");
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (lines[0]!.includes("Share #")) {
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
        pubKeyFilePath={pubKeyPath}
        shares={sharesAmount}
        threshold={3}
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (lines[0]!.includes("Share #")) {
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
    const publicKeyBuffer = await fs.readFile("pub.key");
    const publicKeyResult = publicKeyBuffer.toString("utf-8");
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
      <face.Component shares={sharesAmount} threshold={3} />,
    );

    await expect.poll(() => lastFrameLines("\n\n").length).toEqual(7);
    const [, publicKeyBlock, ...sharesBlocks] = lastFrameLines("\n\n");
    const serializedShares = sharesBlocks.map((shareBlock) =>
      shareBlock.split("\n").slice(1).join(""),
    );

    const textToEncrypt = "Hello world\nNext line please";
    const encryptedData = encryptText(
      textToEncrypt,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      parsePublicKey(Buffer.from(publicKeyBlock!)),
    );
    const decryptedText = decryptText(
      encryptedData,
      sharesToPrivateKey(
        await Promise.all(
          serializedShares.map(async (share) =>
            validate(shareObjectSchema, share),
          ),
        ),
      ),
    );
    expect(textToEncrypt).toEqual(decryptedText);
  });
});
