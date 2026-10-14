import { Box, Newline, Text } from "ink";
import * as React from "react";
import { z } from "zod";

import { SaveDataWarning } from "~/components/save-data-warning";
import { Share } from "~/components/shares";
import { SharesInput } from "~/components/shares-input";
import type { Face } from "~/faces/types";
import { useKeepAlive } from "~/hooks/use-keep-alive";
import { useResetKey } from "~/hooks/use-reset-key";
import { sharesToPrivateKey } from "~/utils/converters";
import { newSharesAmountSchema } from "~/utils/schemas";
import type { ShareObject } from "~/utils/shares";
import { addShare } from "~/utils/shares";

const getNewShare = (shares: ShareObject[]): ShareObject => {
	// We need to verify it's a proper private key
	sharesToPrivateKey(shares);
	return addShare(
		shares.reduce((acc, share) => Math.max(acc, share.id), 0) + 1,
		shares,
	);
};

type Stage =
	| { type: "input" }
	| { type: "result"; result: ShareObject }
	| { type: "error"; message: string };

const AddShare: React.FC = () => {
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
							setStage({ result: getNewShare(shares), type: "result" });
						} catch (error) {
							setStage({
								/* c8 ignore next */
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
				<>
					<SaveDataWarning />
					<Newline />
					<Share share={stage.result} />
				</>
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

const schema = z.object({
	amount: newSharesAmountSchema,
});

export const face: Face<object, z.input<typeof schema>> = {
	Component: AddShare,
	schema,
};
