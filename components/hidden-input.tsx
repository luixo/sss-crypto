import * as React from "react";
import chalk from "chalk";
import { sanitizeBase64 } from "../utils/encoding";
import { Input, Props as InputProps } from "./input";

type ParseResult<T> =
  | { success: true; result: T }
  | { success: false; error: string };

export const HiddenInput: React.FC<
  Omit<InputProps, "onEnter"> & {
    validator: (input: string) => ParseResult<unknown>;
    onDone: (input: string) => void;
  }
> = ({ validator, onDone, ...props }) => {
  const [error, setError] = React.useState<string>();
  const onEnterRaw = React.useCallback(
    (input: string) => {
      const parsedShare = validator(input);
      if (!parsedShare.success) {
        setError(parsedShare.error);
      } else {
        onDone(input);
      }
    },
    [onDone, validator],
  );
  const onKeystrokeRaw = React.useCallback(() => {
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
      onKeystroke={onKeystrokeRaw}
      parseInput={sanitizeBase64}
      formatValue={hideValue}
    />
  );
};
