import * as React from "react";
import chalk from "chalk";
import { sanitizeBase64 } from "../utils/encoding";
import { Input, Props as InputProps } from "./input";

export const HiddenInput: React.FC<
  Omit<InputProps, "onEnter"> & {
    validator: (input: string) => unknown;
    onDone: (input: string) => void;
  }
> = ({ validator, onDone, ...props }) => {
  const [error, setError] = React.useState<string>();
  const onEnterRaw = React.useCallback(
    async (input: string) => {
      try {
        await validator(input);
        onDone(input);
      } catch (e) {
        setError(String(e));
      }
    },
    [onDone, validator],
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
      onKeystroke={onKeystroke}
      parseInput={sanitizeBase64}
      formatValue={hideValue}
    />
  );
};
