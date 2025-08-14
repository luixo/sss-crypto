import * as React from "react";
import fs from "node:fs/promises";
import { Text, Box, Newline } from "ink";

import z from "zod";
import { generatePair } from "~/utils/crypto";
import type { ShareObject, SharesOptions } from "~/utils/shares";
import { keyToPem } from "~/utils/encoding";
import type { Face } from "~/faces/types";
import { SaveDataWarning } from "~/components/save-data-warning";
import { Shares } from "~/components/shares";
import { generateSharesFromKey } from "~/utils/converters";
import {
  localFileTransform,
  notDirectoryTransform,
  sharesSchema,
  thresholdSchema,
} from "~/utils/schemas";

type WriteFileStatus = "idle" | "loading" | "done";

const WriteFileStatusIndicator: React.FC<{
  prefix: string;
  filepath: string;
  status: WriteFileStatus;
}> = ({ prefix, filepath, status }) => {
  if (status === "idle") {
    return null;
  }
  /* c8 ignore start */
  if (status === "loading") {
    return (
      <Box>
        <Text color="yellow">{`${prefix} saving to "${filepath}"...`}</Text>
      </Box>
    );
  }
  /* c8 ignore stop */
  return (
    <Box>
      <Text color="green">{`${prefix} saved to "${filepath}"`}</Text>
    </Box>
  );
};

type Props = SharesOptions & {
  pubKeyFilePath?: string;
};

const GenerateShares: React.FC<Props> = ({ pubKeyFilePath, ...props }) => {
  const [pubKeyStatus, setPubKeyStatus] =
    React.useState<WriteFileStatus>("idle");
  const [state, setState] = React.useState<{
    shares: ShareObject[];
    pair: Awaited<ReturnType<typeof generatePair>>;
  }>();
  React.useEffect(() => {
    if (!state) {
      generatePair().then((pair) => {
        setState({
          pair,
          shares: generateSharesFromKey(pair.privateKey, props),
        });
      });
    }
  }, [props, state]);
  React.useEffect(() => {
    if (pubKeyFilePath && state) {
      setPubKeyStatus("loading");
      fs.writeFile(pubKeyFilePath, keyToPem(state.pair.publicKey)).then(() =>
        setPubKeyStatus("done"),
      );
    }
  }, [pubKeyFilePath, state]);
  return (
    <Box flexDirection="column" gap={1}>
      <SaveDataWarning />
      <Box flexDirection="column">
        {pubKeyFilePath ? (
          <WriteFileStatusIndicator
            filepath={pubKeyFilePath}
            prefix="Public key is"
            status={pubKeyStatus}
          />
        ) : state ? (
          <Box flexDirection="column">
            <Text color="cyan">Public key</Text>
            <Text>{keyToPem(state.pair.publicKey).trim()}</Text>
          </Box>
        ) : null}
      </Box>
      {state ? <Shares shares={state.shares} /> : null}
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
