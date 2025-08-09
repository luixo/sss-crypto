import * as React from "react";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Text, Box, Newline } from "ink";
import { number, coerce, safeParse, toMinValue } from "valibot";

import { Stats } from "node:fs";
import { generatePair } from "../utils/crypto";
import { SharesOptions } from "../utils/shares";
import { keyToPem } from "../utils/encoding";
import { Face } from "./types";
import { SaveDataWarning } from "../components/save-data-warning";
import { Shares } from "../components/shares";
import { privateKeyToShares } from "../utils/converters";

const rootPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);

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

export const face: Face<Props, [Partial<Record<string, string>>]> = {
  Component: GenerateShares,
  validator: async (options) => {
    const thresholdParseResult = safeParse(
      coerce(number([toMinValue(2)]), Number),
      options.threshold,
    );
    if (!thresholdParseResult.success) {
      throw new Error(
        `Error parsing threshold value: ${thresholdParseResult.issues
          .map(({ message }) => message)
          .join("; ")}`,
      );
    }
    const sharesParseResult = safeParse(
      coerce(number([toMinValue(2)]), Number),
      options.shares,
    );
    if (!sharesParseResult.success) {
      throw new Error(
        `Error parsing shares value: ${sharesParseResult.issues
          .map(({ message }) => message)
          .join("; ")}`,
      );
    }
    if (thresholdParseResult.output >= sharesParseResult.output) {
      throw new Error(
        `Scheme ${thresholdParseResult.output} out of ${sharesParseResult.output} cannot be generated: "k" should be less than "n".`,
      );
    }
    let pubKeyFilePath: string | undefined;
    if (options.pubOutput) {
      const relativePath = path.relative(
        rootPath,
        path.resolve(options.pubOutput),
      );
      if (relativePath.startsWith("..")) {
        throw new Error(
          "Public key only can be written in a current directory.",
        );
      }
      let stats: Stats | undefined;
      try {
        stats = await fs.stat(relativePath);
      } catch {
        /* empty */
      }
      if (stats && stats.isDirectory()) {
        throw new Error(`Public key path should not be a directory.`);
      }
      pubKeyFilePath = options.pubOutput;
    }
    return {
      threshold: thresholdParseResult.output,
      shares: sharesParseResult.output,
      pubKeyFilePath,
    };
  },
};
