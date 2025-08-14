import { render } from "ink";

import type { Type } from "cmd-ts";
import { command, option, run, subcommands } from "cmd-ts";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { face as generateSharesFace } from "./faces/generate-shares";
import { face as encryptFace } from "./faces/encrypt";
import { face as decryptFace } from "./faces/decrypt";
import { face as addShareFace } from "./faces/add-share";
import type { Face } from "./faces/types";
import { validate } from "./utils/validation";

import {
  fileSchema,
  newSharesAmountSchema,
  sharesSchema,
  thresholdSchema,
} from "./utils/schemas";

const stdType = <S extends StandardSchemaV1>(
  schema: S,
  displayName: string,
): Type<string, StandardSchemaV1.InferOutput<S>> => ({
  displayName,
  description: "validated via Standard Schema",
  from: async (input) => validate(schema, input),
});

const handleFace =
  <P extends object, I extends object>(face: Face<P, I>) =>
  async (input: I) => {
    const props = await validate(face.schema, input);
    const instance = render(<face.Component {...props} />);
    return instance.waitUntilExit();
  };

export const createProgram = () => {
  const generateSharesCommand = command({
    name: "generate-shares",
    description: "Generate n out of k keys via Shamir's secret sharing scheme",
    args: {
      threshold: option({
        long: "threshold",
        short: "k",
        description:
          "threshold of shared parts required to be combined to a key",
        type: stdType(thresholdSchema, "threshold"),
      }),
      shares: option({
        long: "shares",
        short: "n",
        description: "total amount of shared parts",
        type: stdType(sharesSchema, "shares"),
      }),
      pubOutput: option({
        long: "pubOutput",
        short: "p",
        description: "output filename for a public key",
        type: stdType(fileSchema.optional(), "pubOutput"),
        defaultValue: () => undefined,
      }),
    },
    handler: handleFace(generateSharesFace),
  });

  const decryptCommand = command({
    name: "decrypt",
    description: "Decrypt a message with k out of n shares",
    args: {
      input: option({
        long: "input",
        short: "i",
        description: "path to a file to decrypt",
        type: stdType(fileSchema, "input"),
      }),
    },
    handler: handleFace(decryptFace),
  });

  const addShareCommand = command({
    name: "add-share",
    description: "Add a new share",
    args: {
      amount: option({
        long: "amount",
        short: "n",
        description: "amount of newly added shares",
        type: stdType(newSharesAmountSchema.optional(), "amount"),
        defaultValue: () => 1,
      }),
    },
    handler: handleFace(addShareFace),
  });

  const encryptCommand = command({
    name: "encrypt",
    description: "Encrypt a message with a given public key",
    args: {
      pub: option({
        long: "pub",
        short: "p",
        description: "path to a file to encrypt",
        type: stdType(fileSchema.optional().default("pub.key"), "pubKey"),
        defaultValue: () => "pub.key",
      }),
      input: option({
        long: "input",
        short: "i",
        description: "path to a file to encrypt",
        type: stdType(fileSchema.optional(), "input"),
        defaultValue: () => undefined,
      }),
    },
    handler: handleFace(encryptFace),
  });

  return subcommands({
    name: "sss-cli",
    cmds: {
      "generate-shares": generateSharesCommand,
      decrypt: decryptCommand,
      "add-share": addShareCommand,
      encrypt: encryptCommand,
    },
  });
};

/* c8 ignore next 3 */
if (process.env.NODE_ENV !== "test") {
  run(createProgram(), process.argv.slice(2));
}
