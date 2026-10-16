import { Box, Newline, Text } from "ink";
import * as React from "react";
import { z } from "zod";

import { SharesInput } from "~/components/shares-input";
import type { Face } from "~/faces/types";
import { useKeepAlive } from "~/hooks/use-keep-alive";
import { useResetKey } from "~/hooks/use-reset-key";
import { sharesToPrivateKey } from "~/utils/converters";
import { decryptText, encryptedBoxSchema } from "~/utils/crypto";
import { existingFileSchema } from "~/utils/schemas";
import type { ShareObject } from "~/utils/shares";

const getDecryptedText = (
	encryptedData: z.infer<typeof encryptedBoxSchema>,
	shares: ShareObject[],
): string => {
	const privateKey = sharesToPrivateKey(shares);
	try {
		return decryptText(encryptedData, privateKey);
	} catch (error) {
		if (
			typeof error === "object" &&
			error &&
			"code" in error &&
			typeof error.code === "string" &&
			error.code.startsWith("ERR_OSSL")
		) {
			throw new Error(`Can't decrypt text, probably text is corrupt.`, {
				cause: error,
			});
		}
		if (
			typeof error === "object" &&
			error &&
			"message" in error &&
			typeof error.message === "string" &&
			error.message === "Unsupported state or unable to authenticate data"
		) {
			throw new Error(
				`Can't decrypt text, probably initial vector or auth tag is corrupt.`,
				{
					cause: error,
				},
			);
		}
		throw error;
	}
};

type Props = {
	encryptedData: z.infer<typeof encryptedBoxSchema>;
};

type Stage =
	| { type: "input" }
	| { type: "result"; result: string }
	| { type: "error"; message: string };

const Decrypt: React.FC<Props> = ({ encryptedData }) => {
	const [stage, setStage] = React.useState<Stage>({ type: "input" });
	const sharesKey = useResetKey({
		isActive: stage.type === "error",
		onReset: () => setStage({ type: "input" }),
	});
	useKeepAlive(stage.type === "input");
	switch (stage.type) {
		case "input": {
			return (
				<SharesInput
					key={sharesKey}
					onError={(message) => setStage({ message, type: "error" })}
					onDone={(shares) => {
						try {
							const decryptedText = getDecryptedText(encryptedData, shares);
							setStage({ result: decryptedText, type: "result" });
						} catch (error) {
							setStage({
								message: error instanceof Error ? error.message : String(error),
								type: "error",
							});
						}
					}}
				/>
			);
		}
		case "result": {
			return (
				<Box>
					<Text>
						<Text>Decrypt result:</Text>
						<Newline />
						<Text>{stage.result}</Text>
					</Text>
				</Box>
			);
		}
		case "error": {
			return (
				<Box>
					<Text>
						<Text>Fatal error:</Text>
						<Newline />
						<Text>{stage.message}</Text>
						<Newline />
						<Text>{`Press "Enter" to restart`}</Text>
					</Text>
				</Box>
			);
		}
	}
};

const schema = z
	.object({
		input: existingFileSchema
			.refine((input) => input.length !== 0, {
				error: "Input should not be empty to decrypt.",
			})
			.transform((input) => input.toString())
			.pipe(encryptedBoxSchema),
	})
	.transform(({ input }) => ({ encryptedData: input }));

export const face: Face<Props, z.input<typeof schema>> = {
	Component: Decrypt,
	schema,
};
