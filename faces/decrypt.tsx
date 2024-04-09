import * as React from "react";
import { Text, Box, useInput, Newline } from "ink";
import chalk from "chalk";
import { sanitizeBase64 } from "../utils/encoding";
import { ShareObject, combineShares, deserializeShare } from "../utils/shares";
import { decryptText, parsePrivateKey } from "../utils/crypto";
import { Face } from "./types";
import { Input, type Props as InputProps } from "../utils/input";
import { readFileSafe } from "../utils/fs";
import { useKeepAlive } from "../utils/use-keep-alive";

const safeParseShare = (input: string) => {
  try {
    if ((input.match(/\|/g) || []).length !== 3) {
      throw new Error("Share format is incorrect");
    }
    const result = deserializeShare(input);
    return { success: true as const, result };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
};

export const HiddenInput: React.FC<
  Omit<InputProps, "onEnter"> & {
    onEnter: (input: ShareObject) => void;
  }
> = ({ onEnter, ...props }) => {
  const [error, setError] = React.useState<string>();
  const onEnterRaw = React.useCallback(
    (input: string) => {
      const parsedShare = safeParseShare(input);
      if (!parsedShare.success) {
        setError(parsedShare.error);
      } else {
        onEnter(parsedShare.result);
      }
    },
    [onEnter],
  );
  const onKeystrokeRaw = React.useCallback(() => {
    setError(undefined);
  }, []);
  const hideValue = React.useCallback(
    (value: string) =>
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

const getDecryptedText = (
  encryptedText: string,
  shares: ShareObject[],
): Stage => {
  try {
    const combinedShares = combineShares(shares);
    const privateKey = parsePrivateKey(Buffer.from(combinedShares, "hex"));
    try {
      const decryptedText = decryptText(
        Buffer.from(sanitizeBase64(encryptedText), "base64"),
        privateKey,
      ).toString("utf-8");
      return { type: "result", result: decryptedText };
    } catch (e) {
      if (
        typeof e === "object" &&
        e &&
        "code" in e &&
        typeof e.code === "string" &&
        e.code.startsWith("ERR_OSSL")
      ) {
        return {
          type: "error",
          message: `Can't decrypt text, probably text is corrupt (${e.code})`,
        };
        /* c8 ignore next 3 */
      }
      throw e;
    }
  } catch (e) {
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      e.code === "ERR_OSSL_UNSUPPORTED"
    ) {
      return {
        type: "error",
        message: "Can't combine shares, probably shares are corrupted",
      };
      /* c8 ignore next 3 */
    }
    throw e;
  }
};

type Props = {
  encryptedText: string;
};

type Stage =
  | {
      type: "input";
      shares: ShareObject[];
      index: number;
      threshold: number;
    }
  | { type: "result"; result: string }
  | { type: "error"; message: string };

const initialStage: Stage = {
  type: "input",
  shares: [],
  index: 0,
  threshold: -1,
};

const Decrypt: React.FC<Props> = ({ encryptedText }) => {
  const [stage, setStage] = React.useState<Stage>(initialStage);
  const onShareInput = React.useCallback(
    (share: ShareObject) => {
      setStage((prevStage) => {
        /* c8 ignore next 3 */
        if (prevStage.type !== "input") {
          return prevStage;
        }
        let nextThreshold = prevStage.threshold;
        if (prevStage.threshold === -1) {
          nextThreshold = share.threshold;
        } else if (share.threshold !== nextThreshold) {
          return {
            type: "error",
            message: `Expected all shares to have the same threshold, got ${nextThreshold} and ${share.threshold}`,
          };
        }
        const nextShares = [
          ...prevStage.shares.slice(0, prevStage.index),
          share,
          ...prevStage.shares.slice(prevStage.index + 1),
        ];
        if (prevStage.index === nextThreshold - 1) {
          return getDecryptedText(encryptedText, nextShares);
        }
        return {
          ...prevStage,
          type: "input",
          shares: nextShares,
          threshold: nextThreshold,
          index: prevStage.index + 1,
        };
      });
    },
    [encryptedText],
  );
  useInput(
    (_value, key) => {
      if (key.return) {
        setStage(initialStage);
      }
    },
    { isActive: stage.type === "error" },
  );
  useKeepAlive(stage.type === "input");
  switch (stage.type) {
    case "input": {
      return (
        <Box flexDirection="column">
          {new Array(stage.index).fill(null).map((_, index) => (
            <Box key={index}>
              <Text>Input share #{index + 1} registered.</Text>
            </Box>
          ))}
          <Text>
            <Text>
              Please input share #{stage.index + 1}
              {stage.threshold === -1 ? "" : ` (out of ${stage.threshold})`}
            </Text>
            <Newline />
            <HiddenInput key={stage.index} onEnter={onShareInput} />
          </Text>
        </Box>
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
            <Text>Press "Enter" to restart</Text>
          </Text>
        </Box>
      );
    }
  }
};

export const face: Face<Props, [Partial<Record<string, string>>]> = {
  Component: Decrypt,
  validator: async (options) => {
    const input = options.input
      ? (
          await readFileSafe(options.input, () => `Input at "${options.input}"`)
        ).toString()
      : "";
    if (!input || input.length === 0) {
      throw new Error("Input should not be empty to decrypt.");
    }
    return { encryptedText: input };
  },
};
