import fs from "node:fs/promises";

import { Box, Newline, Text } from "ink";
import * as React from "react";
import { z } from "zod";

import { SaveDataWarning } from "~/components/save-data-warning";
import { Shares } from "~/components/shares";
import type { Face } from "~/faces/types";
import { generateSharesFromKey } from "~/utils/converters";
import { generatePair } from "~/utils/crypto";
import { keyToPem } from "~/utils/encoding";
import {
	localFileTransform,
	notDirectoryTransform,
	sharesSchema,
	thresholdSchema,
} from "~/utils/schemas";
import type { ShareObject, SharesOptions } from "~/utils/shares";

type WriteFileStatus = "idle" | "loading" | "done";

const WriteFileStatusIndicator: React.FC<{
	prefix: string;
	filepath: string;
	status: WriteFileStatus;
}> = ({ prefix, filepath, status }) => {
	if (status === "idle") {
		return null;
	}
	/* c8 ignore start */
	if (status === "loading") {
		return (
			<Box>
				<Text color="yellow">{`${prefix} saving to "${filepath}"...`}</Text>
			</Box>
		);
	}
	/* c8 ignore stop */
	return (
		<Box>
			<Text color="green">{`${prefix} saved to "${filepath}"`}</Text>
		</Box>
	);
};

type Props = SharesOptions & {
	pubKeyFilePath?: string;
};

const GenerateShares: React.FC<Props> = ({ pubKeyFilePath, ...props }) => {
	const [pubKeyStatus, setPubKeyStatus] =
		React.useState<WriteFileStatus>("idle");
	const [state, setState] = React.useState<{
		shares: ShareObject[];
		pair: Awaited<ReturnType<typeof generatePair>>;
	}>();
	const setPairData = React.useCallback(async () => {
		const pair = await generatePair();
		setState({
			pair,
			shares: generateSharesFromKey(pair.privateKey, props),
		});
		// oxlint-disable-next-line react/memo-dependencies react-hooks/exhaustive-deps
	}, []);
	React.useEffect(() => {
		if (!state) {
			// oxlint-disable-next-line react/set-state-in-effect
			void setPairData();
		}
	}, [setPairData, state]);
	React.useEffect(() => {
		if (pubKeyFilePath !== undefined && state) {
			void fs
				.writeFile(pubKeyFilePath, keyToPem(state.pair.publicKey))
				.then(() => setPubKeyStatus("done"));
		}
	}, [pubKeyFilePath, state]);
	return (
		<Box flexDirection="column" gap={1}>
			<SaveDataWarning />
			<Box flexDirection="column">
				{pubKeyFilePath === undefined ? (
					state ? (
						<Box flexDirection="column">
							<Text color="cyan">Public key</Text>
							<Text>{keyToPem(state.pair.publicKey).trim()}</Text>
						</Box>
					) : null
				) : (
					<WriteFileStatusIndicator
						filepath={pubKeyFilePath}
						prefix="Public key is"
						status={state && pubKeyStatus === "idle" ? "loading" : pubKeyStatus}
					/>
				)}
			</Box>
			{state ? <Shares shares={state.shares} /> : null}
			<Newline />
		</Box>
	);
};

const schema = z
	.object({
		pubOutput: z
			.string()
			.transform(localFileTransform)
			.transform(notDirectoryTransform)
			.optional(),
		shares: sharesSchema,
		threshold: thresholdSchema,
	})
	.refine(({ threshold, shares }) => shares > threshold, {
		error: "'k' should be less than 'n'.",
	})
	.transform(({ pubOutput, ...rest }) => ({
		...rest,
		pubKeyFilePath: pubOutput,
	}));

export const face: Face<Props, z.input<typeof schema>> = {
	Component: GenerateShares,
	schema,
};
