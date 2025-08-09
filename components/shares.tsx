import * as React from "react";
import { Text, Box } from "ink";
import { serializeShare, ShareObject } from "../utils/shares";

type Props = {
  shares: ShareObject[];
};

export const Share: React.FC<{ share: ShareObject }> = ({ share }) => (
  <Box flexDirection="column">
    <Text color="green">Share #{share.id}</Text>
    <Text>{serializeShare(share)}</Text>
  </Box>
);

export const Shares: React.FC<Props> = ({ shares }) => (
  <>
    {shares.map((share) => (
      <Share key={share.id} share={share} />
    ))}
  </>
);
