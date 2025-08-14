import * as React from "react";
import { Text, Box, Newline } from "ink";
import z from "zod";
import type { ShareObject } from "../utils/shares";
import { addShare } from "../utils/shares";
import type { Face } from "./types";
import { useKeepAlive } from "../hooks/use-keep-alive";
import { SharesInput } from "../components/shares-input";
import { SaveDataWarning } from "../components/save-data-warning";
import { Share } from "../components/shares";
import { useResetKey } from "../hooks/use-reset-key";
import { sharesToPrivateKey } from "../utils/converters";
import { newSharesAmountSchema } from "../utils/schemas";

const getNewShare = (shares: ShareObject[]): ShareObject => {
  // We need to verify it's a proper private key
  sharesToPrivateKey(shares);
  return addShare(
    shares.reduce((acc, share) => Math.max(acc, share.id), 0) + 1,
    shares,
  );
};

type Stage =
  | { type: "input" }
  | { type: "result"; result: ShareObject }
  | { type: "error"; message: string };

const AddShare: React.FC = () => {
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
          onError={(message) => setStage({ type: "error", message })}
          onDone={(shares) => {
            try {
              setStage({ type: "result", result: getNewShare(shares) });
            } catch (e) {
              setStage({
                type: "error",
                /* c8 ignore next */
                message: e instanceof Error ? e.message : String(e),
              });
            }
          }}
        />
      );
    }
    case "result": {
      return (
        <>
          <SaveDataWarning />
          <Newline />
          <Share share={stage.result} />
        </>
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
            <Text>{`Press "Enter" to restart`}</Text>
          </Text>
        </Box>
      );
    }
  }
};

const schema = z.object({
  amount: newSharesAmountSchema,
});

export const face: Face<object, z.input<typeof schema>> = {
  Component: AddShare,
  schema,
};
