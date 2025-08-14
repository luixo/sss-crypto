import secrets from "secrets.js";
import z from "zod";

import { SHARE_LENGTH } from "./consts";

export const shareObjectSchema = z
  .string()
  .transform((lines) => lines.replaceAll(/\s/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d+\|\d+\|[0-9a-f]+\|[a-zA-Z0-9+=/]*$/, {
        error: "Share format is incorrect",
      })
      .transform((input) => {
        const [threshold = "", bits = "", id = "", data = ""] =
          input.split("|");
        return { threshold, bits, id, data };
      }),
  )
  .pipe(
    z
      .object({
        threshold: z.string().transform(Number).pipe(z.number().min(2)),
        bits: z
          .string()
          .transform((input) => Number.parseInt(input, 36))
          .pipe(z.number().min(3).max(20)),
        id: z
          .string()
          .transform((input) => Number.parseInt(input, 16))
          .pipe(z.number().min(1)),
        data: z
          .string()
          .regex(
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
            {
              error: "Expected to have base64 for a share body",
            },
          )
          .refine((data) => data.length === SHARE_LENGTH, {
            error: `Expected to have ${SHARE_LENGTH} symbols for a share body`,
          }),
      })
      .refine(({ bits, id }) => id <= 2 ** (bits - 1), {
        error: "Expected id to be in Galois field",
      }),
  );

export type ShareObject = z.infer<typeof shareObjectSchema>;

export const serializeShare = ({
  bits,
  id,
  data,
  threshold,
}: ShareObject): string =>
  [threshold, bits.toString(36), id.toString(16), data].join("|");

const serializeShareSecret = (
  share: ShareObject,
): string => // eslint-disable-next-line no-underscore-dangle
  secrets._constructPublicShareString(
    share.bits.toString(10),
    share.id.toString(10),
    Buffer.from(share.data, "base64").toString("hex"),
  );

const deserializeShareSecret = (
  share: string,
  threshold: number,
): ShareObject => {
  // see https://github.com/grempe/secrets.js?tab=readme-ov-file#share-format
  const { bits, id, data } = secrets.extractShareComponents(share);
  return {
    bits,
    id,
    threshold,
    data: Buffer.from(data, "hex").toString("base64"),
  };
};

export type SharesOptions = {
  threshold: number;
  shares: number;
};

export const generateShares = (
  message: string,
  options: SharesOptions,
): ShareObject[] =>
  secrets
    .share(message, options.shares, options.threshold)
    .map((share) => deserializeShareSecret(share, options.threshold));

export const combineShares = (shares: ShareObject[]): string =>
  secrets.combine(shares.map(serializeShareSecret));

export const addShare = (id: number, shares: ShareObject[]): ShareObject =>
  deserializeShareSecret(
    secrets.newShare(id, shares.map(serializeShareSecret)),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    shares[0]!.threshold,
  );
