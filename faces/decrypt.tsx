import * as React from "react";
import { Text, Box, Newline } from "ink";
import { ShareObject } from "../utils/shares";
import {
  EncryptedData,
  decryptText,
  deserializeEncryptedData,
} from "../utils/crypto";
import { Face } from "./types";
import { readFileSafe } from "../utils/fs";
import { useKeepAlive } from "../hooks/use-keep-alive";
import { SharesInput } from "../components/shares-input";
import { useResetKey } from "../hooks/use-reset-key";
import { sharesToPrivateKey } from "../utils/converters";

const getDecryptedText = (
  encryptedData: EncryptedData,
  shares: ShareObject[],
): string => {
  const privateKey = sharesToPrivateKey(shares);
  try {
    return decryptText(encryptedData, privateKey);
  } catch (e) {
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      typeof e.code === "string" &&
      e.code.startsWith("ERR_OSSL")
    ) {
      throw new Error(`Can't decrypt text, probably text is corrupt.`);
    }
    if (
      typeof e === "object" &&
      e &&
      "message" in e &&
      typeof e.message === "string" &&
      e.message === "Unsupported state or unable to authenticate data"
    ) {
      throw new Error(
        `Can't decrypt text, probably initial vector or auth tag is corrupt.`,
      );
      /* c8 ignore next 3 */
    }
    throw e;
  }
};

type Props = {
  encryptedData: EncryptedData;
};

type Stage =
  | { type: "input" }
  | { type: "result"; result: string }
  | { type: "error"; message: string };

const Decrypt: React.FC<Props> = ({ encryptedData }) => {
  const [stage, setStage] = React.useState<Stage>({ type: "input" });
  const sharesKey = useResetKey({
    onReset: () => setStage({ type: "input" }),
    isActive: stage.type === "error",
  });
  useKeepAlive(stage.type === "input");
  switch (stage.type) {
    case "input": {
      return (
        <SharesInput
          key={sharesKey}
          onDone={(shares) => {
            try {
              const decryptedText = getDecryptedText(encryptedData, shares);
              setStage({ type: "result", result: decryptedText });
            } catch (e) {
              setStage({
                type: "error",
                /* c8 ignore next */
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }}
          onError={(message) => setStage({ type: "error", message })}
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
    return { encryptedData: deserializeEncryptedData(input) };
  },
};
