import { useInput } from "ink";
import React from "react";

export const useResetKey = ({
  isActive = true,
  onReset,
}: {
  onReset?: () => void;
  isActive?: boolean;
}) => {
  const [resetKey, setResetKey] = React.useState(0);
  useInput(
    (_value, key) => {
      if (key.return) {
        setResetKey((prevKey) => prevKey + 1);
        onReset?.();
      }
    },
    { isActive },
  );
  return resetKey;
};
