import * as React from "react";
import { Text, Box, useInput, Newline } from "ink";

import { KeyObject } from "crypto";
import { encryptText, parsePublicKey } from "../utils/crypto";
import { readFileSafe } from "../utils/fs";
import { Face } from "./types";

const Input: React.FC<{
  onDone: (input: string) => void;
}> = ({ onDone }) => {
  const [input, setInput] = React.useState("");
  useInput((value, key) => {
    if (key.return) {
      if (input.length !== 0) {
        onDone(input);
      }
      setInput("");
    } else if (key.backspace) {
      setInput((prevInput) => prevInput.slice(0, -1));
    } else {
      setInput((prevInput) => prevInput + value);
    }
  });
  if (input.length === 0) {
    return null;
  }
  return (
    <>
      <Newline />
      <Text color="green">{input}</Text>
    </>
  );
};

const getEncryptedText = (input: string, publicKey: KeyObject) =>
  encryptText(Buffer.from(input), publicKey);

type Props = {
  input: string;
  publicKey: KeyObject;
};

type Stage =
  | {
      type: "input";
    }
  | { type: "result"; encryptedText: Buffer };

const Encrypt: React.FC<Props> = ({ input: initialInput, publicKey }) => {
  const [stage, setStage] = React.useState<Stage>(
    initialInput
      ? {
          type: "result",
          encryptedText: getEncryptedText(initialInput, publicKey),
        }
      : {
          type: "input",
        },
  );
  const onShareInput = React.useCallback(
    (input: string) => {
      setStage((prevStage) => {
        /* c8 ignore next 3 */
        if (prevStage.type !== "input") {
          return prevStage;
        }
        return {
          type: "result",
          encryptedText: getEncryptedText(input, publicKey),
        };
      });
    },
    [publicKey],
  );
  switch (stage.type) {
    case "input": {
      return (
        <Box>
          <Text>
            <Text>Please input text to encrypt:</Text>
            <Input onDone={onShareInput} />
          </Text>
        </Box>
      );
    }
    case "result": {
      return (
        <Box flexDirection="column">
          <Text>Encryption result:</Text>
          <Newline />
          <Text>{stage.encryptedText.toString("base64")}</Text>
        </Box>
      );
    }
  }
};

export const face: Face<Props, [string, Partial<Record<string, string>>]> = {
  Component: Encrypt,
  validator: async (input, options) => {
    const publicKey = await readFileSafe(
      options.pub as string,
      () => `Public key at "${options.pub}"`,
    );
    try {
      return { publicKey: parsePublicKey(publicKey), input };
    } catch (e) {
      if (
        typeof e === "object" &&
        e &&
        "code" in e &&
        e.code === "ERR_OSSL_UNSUPPORTED"
      ) {
        throw new Error("Can't read public key, probably data is corrupted.");
        /* c8 ignore next 3 */
      }
      throw e;
    }
  },
};
