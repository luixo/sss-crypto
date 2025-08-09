import React from "react";
import { Command } from "commander";
import { render } from "ink";

import { face as generateSharesFace } from "./faces/generate-shares";
import { face as encryptFace } from "./faces/encrypt";
import { face as decryptFace } from "./faces/decrypt";
import { face as addShareFace } from "./faces/add-share";
import { Face } from "./faces/types";

export const createProgram = () => {
  const program = new Command();

  const handleFace =
    <P extends object, I extends unknown[]>(face: Face<P, I>) =>
    async (...input: I) => {
      try {
        const props = await face.validator(...input);
        const instance = render(<face.Component {...props} />);
        await instance.waitUntilExit();
      } catch (e) {
        program.error(String(e));
      }
    };

  program
    .command("generate-shares")
    .description("Generate n out of k keys via Shamir's secret sharing scheme")
    .requiredOption(
      "-k, --threshold <amount>",
      "threshold of shared parts required to be combined to a key",
    )
    .requiredOption("-n, --shares <amount>", "total amount of shared parts")
    .option("-p --pubOutput <filename>", "output filename for a public key")
    .action((options) => handleFace(generateSharesFace)(options));

  program
    .command("decrypt")
    .description("Decrypt a message with k out of n shares")
    .option("-i, --input <text>", "path to a file to decrypt")
    .action((options) => handleFace(decryptFace)(options));

  program
    .command("add-share")
    .description("Add a new share")
    .option("-n, --amount <amount>", "amount of newly added shares")
    .action((options) => handleFace(addShareFace)(options));

  program
    .command("encrypt")
    .description("Encrypt a message with a given public key")
    .requiredOption(
      "-p, --pub <pubkey>",
      "path to a pub key to encrypt text with",
      "pub.key",
    )
    .option("-i, --input <text>", "path to a file to encrypt")
    .action(async (options) => handleFace(encryptFace)(options));

  return program;
};

/* c8 ignore next 3 */
if (process.env.NODE_ENV !== "test") {
  createProgram().parse();
}
