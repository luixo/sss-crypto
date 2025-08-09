import * as React from "react";
import { Text, Box, Newline } from "ink";
import { deserializeShare, ShareObject } from "../utils/shares";
import { useKeepAlive } from "../hooks/use-keep-alive";
import { HiddenInput } from "./hidden-input";

type Props = {
  onDone: (shares: ShareObject[]) => void;
  onError: (message: string) => void;
};

export const SharesInput: React.FC<Props> = ({ onDone, onError }) => {
  const [threshold, setThreshold] = React.useState<number | undefined>();
  const [shares, setShares] = React.useState<ShareObject[]>([]);
  const onShareInput = React.useCallback(
    (input: string) => {
      const share = deserializeShare(input);
      if (threshold && threshold !== share.threshold) {
        onError(
          `Expected all shares to have the same threshold, got ${threshold} and ${share.threshold}`,
        );
        return;
      }
      setThreshold((prevThreshold) => prevThreshold || share.threshold);
      setShares((prevShares) => [...prevShares, share]);
    },
    [threshold, onError],
  );
  React.useEffect(() => {
    if (shares.length === threshold) {
      onDone(shares);
    }
  }, [shares, threshold, onDone]);
  useKeepAlive();
  return (
    <Box flexDirection="column">
      {Array.from({ length: shares.length }).map((_, index) => (
        <Box key={index}>
          <Text>Input share #{index + 1} registered.</Text>
        </Box>
      ))}
      <Text>
        <Text>
          Please input share #{shares.length + 1}
          {!threshold ? "" : ` (out of ${threshold})`}
        </Text>
        <Newline />
        <HiddenInput
          key={shares.length}
          onDone={onShareInput}
          validator={React.useCallback((input: string) => {
            try {
              if ((input.match(/\|/g) || []).length !== 3) {
                throw new Error("Share format is incorrect");
              }
              const result = deserializeShare(input);
              return { success: true as const, result };
            } catch (e) {
              return { success: false as const, error: String(e) };
            }
          }, [])}
        />
      </Text>
    </Box>
  );
};
