import * as React from "react";
import { Text, Box, useInput, Newline } from "ink";
import { sanitizeBase64 } from "../utils/encoding";
import { ShareObject, combineShares, deserializeShare } from "../utils/shares";
import { decryptText, parsePrivateKey } from "../utils/crypto";
import { Face } from "./types";

const safeParseShare = (input: string) => {
  try {
    const result = deserializeShare(input);
    return { success: true as const, result };
  } catch (e) {
    return { success: false as const, error: String(e) };
  }
};

const HiddenInput: React.FC<{
  onDone: (input: ShareObject) => void;
}> = ({ onDone }) => {
  const [input, setInput] = React.useState("");
  const [error, setError] = React.useState<string>();
  React.useEffect(() => {
    const sanitizedInput = sanitizeBase64(input);
    if (sanitizedInput.length !== input.length) {
      setInput(sanitizedInput);
    }
  }, [input]);
  useInput((value, key) => {
    setError(undefined);
    if (key.return) {
      const parsedShare = safeParseShare(input);
      if (!parsedShare.success) {
        setError(parsedShare.error);
      } else {
        onDone(parsedShare.result);
      }
      setInput("");
    } else if (key.backspace) {
      setInput((prevInput) => prevInput.slice(0, -1));
    } else {
      setInput((prevInput) => prevInput + value);
    }
  });
  return (
    <Text color={error || input.length === 0 ? "red" : "green"}>
      {error ||
        (input.length === 0
          ? "(your input is hidden)"
          : `(input of length ${input.length})`)}
    </Text>
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
            <HiddenInput onDone={onShareInput} />
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

export const face: Face<Props, [string]> = {
  Component: Decrypt,
  validator: (encryptedText) => {
    if (encryptedText.length === 0) {
      throw new Error("Input should not be empty to decrypt.");
    }
    return { encryptedText };
  },
};
