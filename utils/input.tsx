import { Text, useInput } from "ink";
import * as React from "react";

export type Props = {
  initialValue?: string;
  onArrow?: (type: "left" | "right", text: string) => void;
  onEnter?: (text: string) => void;
  onKeystroke?: (stroke: string) => void;
  formatValue?: (value: string) => string;
  parseInput?: (value: string) => string;
};

const id = <T,>(input: T) => input;

export const Input: React.FC<Props> = ({
  onArrow,
  onEnter,
  onKeystroke,
  parseInput = id,
  formatValue = id,
  initialValue = "",
}) => {
  const [input, setInput] = React.useState(() => initialValue);
  useInput((value, key) => {
    onKeystroke?.(value);
    if (key.leftArrow || key.rightArrow) {
      onArrow?.(key.leftArrow ? "left" : "right", input);
    } else if (key.return) {
      onEnter?.(input);
    } else if (key.backspace || key.delete) {
      setInput((prevInput) => parseInput(prevInput.slice(0, -1)));
    } else {
      setInput((prevInput) => parseInput(prevInput + value));
    }
  });
  if (input.length === 0) {
    return <Text color="red">(no input)</Text>;
  }
  return <Text color="green">{formatValue(input)}</Text>;
};
