import chalk from "chalk";
import * as React from "react";
import type z from "zod";

import type { Props as InputProps } from "~/components/input";
import { Input } from "~/components/input";
import { sanitizeBase64 } from "~/utils/encoding";
import { validate } from "~/utils/validation";

type ValidationProps<I, O> = {
	schema: z.ZodType<O, I>;
	onDone: (input: O) => void;
};

export const HiddenInput: React.FC<
	Omit<InputProps, "onEnter"> & ValidationProps<unknown, unknown>
> = ({ schema, onDone, ...props }) => {
	const [localError, setLocalError] = React.useState<string>();
	const onEnterRaw = React.useCallback(
		async (input: string) => {
			try {
				onDone(await validate(schema, input));
			} catch (error) {
				setLocalError(String(error));
			}
		},
		[onDone, schema],
	);
	const onKeystroke = React.useCallback<
		NonNullable<React.ComponentProps<typeof Input>["onKeystroke"]>
	>((_, key) => {
		if (key.return) {
			return;
		}
		setLocalError(undefined);
	}, []);
	const hideValue = React.useCallback(
		(value: string) =>
			/* c8 ignore next */
			`(input of length ${value.length})${localError === undefined ? "" : `\n${chalk.red(localError)}`}`,
		[localError],
	);
	return (
		<Input
			onEnter={(input) => {
				void onEnterRaw(input);
			}}
			{...props}
			formatValue={hideValue}
			onKeystroke={onKeystroke}
			parseInput={sanitizeBase64}
		/>
	);
};
