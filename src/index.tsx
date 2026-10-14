import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Type } from "cmd-ts";
import { command, option, run, subcommands } from "cmd-ts";
import { render } from "ink";

import { face as addShareFace } from "./faces/add-share";
import { face as decryptFace } from "./faces/decrypt";
import { face as encryptFace } from "./faces/encrypt";
import { face as generateSharesFace } from "./faces/generate-shares";
import type { Face } from "./faces/types";
import {
	fileSchema,
	newSharesAmountSchema,
	sharesSchema,
	thresholdSchema,
} from "./utils/schemas";
import { mapArgErrors, validate } from "./utils/validation";

const stdType = <S extends StandardSchemaV1>(
	schema: S,
	displayName: string,
): Type<string, StandardSchemaV1.InferOutput<S>> => ({
	description: "validated via Standard Schema",
	displayName,
	from: async (input) => validate(schema, input, mapArgErrors),
});

const handleFace =
	<P extends object, I extends object>(face: Face<P, I>) =>
	async (input: I) => {
		const props = await validate(face.schema, input, mapArgErrors);
		const instance = render(<face.Component {...props} />);
		return instance.waitUntilExit();
	};

export const createProgram = () => {
	const generateSharesCommand = command({
		args: {
			pubOutput: option({
				defaultValue: () => undefined,
				description: "output filename for a public key",
				long: "pubOutput",
				short: "p",
				type: stdType(fileSchema.optional(), "pubOutput"),
			}),
			shares: option({
				description: "total amount of shared parts",
				long: "shares",
				short: "n",
				type: stdType(sharesSchema, "shares"),
			}),
			threshold: option({
				description:
					"threshold of shared parts required to be combined to a key",
				long: "threshold",
				short: "k",
				type: stdType(thresholdSchema, "threshold"),
			}),
		},
		description: "Generate n out of k keys via Shamir's secret sharing scheme",
		handler: handleFace(generateSharesFace),
		name: "generate-shares",
	});

	const decryptCommand = command({
		args: {
			input: option({
				description: "path to a file to decrypt",
				long: "input",
				short: "i",
				type: stdType(fileSchema, "input"),
			}),
		},
		description: "Decrypt a message with k out of n shares",
		handler: handleFace(decryptFace),
		name: "decrypt",
	});

	const addShareCommand = command({
		args: {
			amount: option({
				defaultValue: () => 1,
				description: "amount of newly added shares",
				long: "amount",
				short: "n",
				type: stdType(newSharesAmountSchema.optional(), "amount"),
			}),
		},
		description: "Add a new share",
		handler: handleFace(addShareFace),
		name: "add-share",
	});

	const encryptCommand = command({
		args: {
			input: option({
				defaultValue: () => undefined,
				description: "path to a file to encrypt",
				long: "input",
				short: "i",
				type: stdType(fileSchema.optional(), "input"),
			}),
			pub: option({
				defaultValue: () => "pub.key",
				description: "path to a file to encrypt",
				long: "pub",
				short: "p",
				type: stdType(fileSchema.optional().default("pub.key"), "pubKey"),
			}),
		},
		description: "Encrypt a message with a given public key",
		handler: handleFace(encryptFace),
		name: "encrypt",
	});

	return subcommands({
		cmds: {
			"add-share": addShareCommand,
			decrypt: decryptCommand,
			encrypt: encryptCommand,
			"generate-shares": generateSharesCommand,
		},
		name: "sss-cli",
	});
};

/* v8 ignore if -- @preserve: executable entry point, not the imported CLI factory */
// oxlint-disable-next-line node/no-process-env
if (process.env.NODE_ENV !== "test") {
	await run(createProgram(), process.argv.slice(2));
}
