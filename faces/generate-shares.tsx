import * as React from "react";
import * as fs from "node:fs/promises";
import { Text, Box, Newline } from "ink";

import z from "zod";
import { generatePair } from "../utils/crypto";
import { SharesOptions } from "../utils/shares";
import { keyToPem } from "../utils/encoding";
import { Face } from "./types";
import { SaveDataWarning } from "../components/save-data-warning";
import { Shares } from "../components/shares";
import { privateKeyToShares } from "../utils/converters";
import {
  localFileTransform,
  notDirectoryTransform,
  sharesSchema,
  thresholdSchema,
} from "../utils/schemas";

type WriteFileStatus = "idle" | "loading" | "done";

const WriteFileStatusIndicator: React.FC<{
  prefix: string;
  filepath: string;
  status: WriteFileStatus;
}> = ({ prefix, filepath, status }) => {
  if (status === "idle") {
    return null;
  }
  if (status === "loading") {
    return (
      <Box>
        <Text color="yellow">
          {prefix} saving to "{filepath}"...
        </Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color="green">
        {prefix} saved to "{filepath}"
      </Text>
    </Box>
  );
};

type Props = SharesOptions & {
  pubKeyFilePath?: string;
};

const GenerateShares: React.FC<Props> = ({ pubKeyFilePath, ...props }) => {
  const [pubKeyStatus, setPubKeyStatus] =
    React.useState<WriteFileStatus>("idle");
  const [{ shares: generatedShares, publicKey }] = React.useState(() => {
    const pair = generatePair();
    return {
      shares: privateKeyToShares(pair.privateKey, props),
      publicKey: keyToPem(pair.publicKey),
    };
  });
  React.useEffect(() => {
    if (pubKeyFilePath) {
      setPubKeyStatus("loading");
      fs.writeFile(pubKeyFilePath, publicKey).then(() =>
        setPubKeyStatus("done"),
      );
    }
  }, [pubKeyFilePath, publicKey]);
  return (
    <Box flexDirection="column" gap={1}>
      <SaveDataWarning />
      <Box flexDirection="column">
        {pubKeyFilePath ? (
          <WriteFileStatusIndicator
            prefix="Public key is"
            status={pubKeyStatus}
            filepath={pubKeyFilePath}
          />
        ) : (
          <Box flexDirection="column">
            <Text color="cyan">Public key</Text>
            <Text>{publicKey.trim()}</Text>
          </Box>
        )}
      </Box>
      <Shares shares={generatedShares} />
      <Newline />
    </Box>
  );
};

const schema = z
  .object({
    threshold: thresholdSchema,
    shares: sharesSchema,
    pubOutput: z
      .string()
      .transform(localFileTransform)
      .transform(notDirectoryTransform)
      .optional(),
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
