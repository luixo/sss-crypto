import * as React from "react";
import chalk from "chalk";
import type z from "zod";
import { sanitizeBase64 } from "../utils/encoding";
import type { Props as InputProps } from "./input";
import { Input } from "./input";
import { validate } from "../utils/validation";

type ValidationProps<I, O> = {
  schema: z.ZodType<O, I>;
  onDone: (input: O) => void;
};

export const HiddenInput: React.FC<
  Omit<InputProps, "onEnter"> & ValidationProps<unknown, unknown>
> = ({ schema, onDone, ...props }) => {
  const [error, setError] = React.useState<string>();
  const onEnterRaw = React.useCallback(
    async (input: string) => {
      try {
        onDone(await validate(schema, input));
      } catch (e) {
        setError(String(e));
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
    setError(undefined);
  }, []);
  const hideValue = React.useCallback(
    (value: string) =>
      /* c8 ignore next */
      `(input of length ${value.length})${error ? `\n${chalk.red(error)}` : ""}`,
    [error],
  );
  return (
    <Input
      onEnter={onEnterRaw}
      {...props}
      formatValue={hideValue}
      onKeystroke={onKeystroke}
      parseInput={sanitizeBase64}
    />
  );
};
