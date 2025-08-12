import * as React from "react";
import { Text, Box, Newline } from "ink";

import { KeyObject } from "crypto";
import z from "zod";
import { encryptText, serializeEncryptedData } from "../utils/crypto";
import { Face } from "./types";
import { useKeepAlive } from "../hooks/use-keep-alive";
import { Input } from "../components/input";
import { existingFileSchema, publicKeyTransform } from "../utils/schemas";

const START_TEMPLATE = "<%";
const END_TEMPLATE = "%>";

type Template = {
  startIndex: number;
  endIndex: number;
  templateValue: string;
};

const getTemplates = (input: string): Template[] => {
  const matches = input.matchAll(
    new RegExp(`${START_TEMPLATE}.*?${END_TEMPLATE}`, "g"),
  );
  return [...matches].map((match) => ({
    startIndex: match.index!,
    endIndex: match.index! + match[0].length,
    templateValue: match[0].slice(START_TEMPLATE.length, -END_TEMPLATE.length),
  }));
};

const getEncryptedStage = (
  input: string,
  publicKey: KeyObject,
  templates: (Template & { substitute: string })[],
): Stage => {
  const templatedInput = templates.reduceRight(
    (acc, { startIndex, endIndex, substitute }) =>
      acc.slice(0, startIndex) + substitute + acc.slice(endIndex),
    input,
  );
  return {
    type: "result",
    encryptedText: serializeEncryptedData(
      encryptText(templatedInput, publicKey),
    ),
  };
};

const verifyInputSubstitutes = (input: string, publicKey: KeyObject): Stage => {
  const templates = getTemplates(input);
  if (templates.length === 0) {
    return getEncryptedStage(input, publicKey, []);
  }
  return {
    type: "substitutes",
    input,
    templates,
    substitutes: templates.map(() => null),
    substituteIndex: 0,
  };
};

type Props = {
  input?: string;
  publicKey: KeyObject;
};

type Stage =
  | {
      type: "input";
    }
  | {
      type: "substitutes";
      input: string;
      templates: Template[];
      substituteIndex: number;
      substitutes: (null | string)[];
    }
  | { type: "result"; encryptedText: string };

const Encrypt: React.FC<Props> = ({ input: initialInput, publicKey }) => {
  const [stage, setStage] = React.useState<Stage>(() => {
    if (!initialInput) {
      return { type: "input" };
    }
    return verifyInputSubstitutes(initialInput, publicKey);
  });
  const onShareInput = React.useCallback(
    (input: string) => {
      if (!input) {
        return;
      }
      setStage((prevStage) => {
        /* c8 ignore next 3 */
        if (prevStage.type !== "input") {
          return prevStage;
        }
        return verifyInputSubstitutes(input, publicKey);
      });
    },
    [publicKey],
  );
  const onArrow = React.useCallback(
    (type: "left" | "right", text: string) => {
      setStage((prevStage) => {
        /* c8 ignore next 3 */
        if (prevStage.type !== "substitutes") {
          return prevStage;
        }
        const currentIndex = prevStage.substituteIndex;
        const updatedStage = {
          ...prevStage,
          substitutes: [
            ...prevStage.substitutes.slice(0, currentIndex),
            text,
            ...prevStage.substitutes.slice(currentIndex + 1),
          ],
        };
        if (
          prevStage.substituteIndex ===
          (type === "left" ? 0 : prevStage.substitutes.length - 1)
        ) {
          if (
            currentIndex === prevStage.substitutes.length - 1 &&
            type === "right" &&
            updatedStage.substitutes.every(Boolean)
          ) {
            return getEncryptedStage(
              prevStage.input,
              publicKey,
              prevStage.templates.map((template, index) => ({
                ...template,
                substitute: updatedStage.substitutes[index]!,
              })),
            );
          }
          return updatedStage;
        }
        return {
          ...updatedStage,
          substituteIndex:
            prevStage.substituteIndex + (type === "left" ? -1 : 1),
        };
      });
    },
    [publicKey],
  );
  const onEnter = React.useCallback(
    (text: string) => onArrow("right", text),
    [onArrow],
  );
  // We need to keep component alive bc remounting input with different keys shut down the app
  useKeepAlive(stage.type !== "result");
  switch (stage.type) {
    case "input": {
      return (
        <Box flexDirection="column">
          <Text>Please input text to encrypt:</Text>
          <Input onEnter={onShareInput} />
        </Box>
      );
    }
    case "substitutes": {
      const currentTemplate = stage.templates[stage.substituteIndex];
      const OFFSET = 10;
      return (
        <Box flexDirection="column">
          <Text>
            {stage.substitutes
              .filter(
                (substitute): substitute is string =>
                  substitute !== null && substitute !== "",
              )
              .map((substitute, index) => {
                const template = stage.templates[index].templateValue.trim();
                return (
                  <React.Fragment key={index}>
                    {index === 0 ? null : <Newline />}
                    <Text
                      color={
                        stage.substituteIndex === index ? "green" : undefined
                      }
                    >
                      {`✔️  [${template} -> ${substitute.length} symbol(s)]`}
                    </Text>
                  </React.Fragment>
                );
              })}
          </Text>
          <Box borderBottom borderStyle="classic">
            {currentTemplate.startIndex === 0 ? null : (
              <Text>{`${currentTemplate.startIndex < OFFSET ? "" : "..."}${stage.input.slice(Math.max(0, currentTemplate.startIndex - OFFSET), currentTemplate.startIndex)}`}</Text>
            )}
            <Text color="green">{`${START_TEMPLATE}${currentTemplate.templateValue}${END_TEMPLATE}`}</Text>
            {currentTemplate.endIndex === stage.input.length - 1 ? null : (
              <Text>{`${stage.input.slice(currentTemplate.endIndex, currentTemplate.endIndex + OFFSET)}${currentTemplate.endIndex + OFFSET > stage.input.length - 1 ? "" : "..."}`}</Text>
            )}
          </Box>
          <Box flexDirection="column">
            <Text>Please input a substitute:</Text>
            <Input
              key={stage.substituteIndex}
              initialValue={
                stage.substitutes[stage.substituteIndex] ?? undefined
              }
              onEnter={onEnter}
              onArrow={onArrow}
            />
          </Box>
        </Box>
      );
    }
    case "result": {
      return (
        <Box flexDirection="column">
          <Text>Encryption result:</Text>
          <Text>{stage.encryptedText}</Text>
        </Box>
      );
    }
  }
};

const schema = z
  .object({
    pub: existingFileSchema.transform(publicKeyTransform),
    input: existingFileSchema
      .optional()
      .transform((input) => input?.toString() ?? ""),
  })
  .transform(({ input, pub }) => ({ input, publicKey: pub }));

export const face: Face<Props, z.input<typeof schema>> = {
  Component: Encrypt,
  schema,
};
