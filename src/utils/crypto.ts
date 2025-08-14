import * as crypto from "node:crypto";
import { promisify } from "node:util";
import z from "zod";
import { sanitizeBase64 } from "./encoding";

const symmetricEncryptionBytes = 256 as const;
const symmetricEncryptionMethod =
  `aes-${symmetricEncryptionBytes}-gcm` as const;
const asymmetricEncryptionBytes = 2048 as const;
const asymmetricEncryptionMethod = "rsa" as const;
const initVectorBytes = 16 as const;
const authTagBytes = 16 as const;
const brandingTag = "sss-enc" as const;

export const generatePair = async () =>
  promisify(crypto.generateKeyPair)(asymmetricEncryptionMethod, {
    modulusLength: asymmetricEncryptionBytes,
  });

export const parsePublicKey = (data: Buffer): crypto.KeyObject =>
  crypto.createPublicKey({
    key: data,
    format: "pem",
    type: "pkcs1",
  });

export const parsePrivateKey = (data: Buffer): crypto.KeyObject =>
  crypto.createPrivateKey({
    key: data,
    format: "der",
    type: "pkcs1",
  });

// In base64 each 4 chars represent 3 bytes
// see https://stackoverflow.com/a/13378842
const getBase64ByteLength = (initialBytes: number) =>
  Math.ceil(initialBytes / 3) * 4;

const initialVectorLength = getBase64ByteLength(initVectorBytes);
const authTagLength = getBase64ByteLength(authTagBytes);
const aesKeyLength = getBase64ByteLength(symmetricEncryptionBytes);
export const encryptedBoxSchema = z
  .string()
  .transform((lines) => lines.replaceAll(/\s/g, ""))
  .pipe(
    z.string().regex(/^.*\|.*\|.*\|.*\|.*$/, {
      error: "Encrypted box format is incorrect",
    }),
  )
  .transform((box) => {
    const [
      tag = "",
      initVector = "",
      authTag = "",
      encryptedAesKey = "",
      encryptedText = "",
      ...rest
    ] = box.split("|").map((element) => element.replaceAll(/\s/g, ""));
    return {
      tag: tag as typeof brandingTag,
      initVector,
      authTag,
      encryptedAesKey,
      encryptedText,
      extra: rest.join("|"),
    };
  })
  .pipe(
    z.object({
      tag: z.literal(brandingTag, {
        error: `Data is invalid, expected data with "${brandingTag}" prefix.`,
      }),
      initVector: z
        .string()
        .length(initialVectorLength, {
          error: `Initial vector has to have length of ${initialVectorLength} bytes.`,
        })
        .transform(sanitizeBase64),
      authTag: z
        .string()
        .length(initialVectorLength, {
          error: `Auth tag has to have length of ${authTagLength} bytes.`,
        })
        .transform(sanitizeBase64),
      encryptedAesKey: z
        .string()
        .length(aesKeyLength, {
          error: `Encrypted AES key has to have length of ${aesKeyLength} bytes.`,
        })
        .transform(sanitizeBase64),
      encryptedText: z
        .string()
        .min(getBase64ByteLength(1), {
          error: `No text to decrypt on decryption.`,
        })
        .transform(sanitizeBase64),
      extra: z.string().refine((value) => value.length === 0, {
        error: "Extra data on decryption.",
      }),
    }),
  );

export const serializeEncryptedData = ({
  tag,
  authTag,
  initVector,
  encryptedAesKey,
  encryptedText,
}: z.output<typeof encryptedBoxSchema>) =>
  [tag, initVector, authTag, encryptedAesKey, encryptedText].join("|");

const cipherSymmetric = ({
  key,
  initVector,
  dataToEncrypt,
}: {
  key: Buffer;
  initVector: Buffer;
  dataToEncrypt: string;
}) => {
  const cipher = crypto.createCipheriv(
    symmetricEncryptionMethod,
    key,
    initVector,
  );
  const encryptedText = Buffer.concat([
    cipher.update(dataToEncrypt, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return { encryptedText, authTag };
};
const decipherSymmetric = ({
  key,
  initVector,
  encryptedText,
  authTag,
}: {
  key: Buffer;
  initVector: Buffer;
  encryptedText: Buffer;
  authTag: Buffer;
}) => {
  const decipher = crypto.createDecipheriv(
    symmetricEncryptionMethod,
    key,
    initVector,
  );
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(encryptedText),
    decipher.final(),
  ]).toString("utf8");
};

export const encryptText = (
  dataToEncrypt: string,
  publicKey: crypto.KeyObject,
): z.output<typeof encryptedBoxSchema> => {
  const symmetricKey = crypto.randomBytes(symmetricEncryptionBytes / 8);
  const initVector = crypto.randomBytes(initVectorBytes);
  const encryptedAesKey = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    symmetricKey,
  );
  const { authTag, encryptedText } = cipherSymmetric({
    key: symmetricKey,
    initVector,
    dataToEncrypt,
  });
  return {
    tag: "sss-enc",
    authTag: authTag.toString("base64"),
    initVector: initVector.toString("base64"),
    encryptedAesKey: encryptedAesKey.toString("base64"),
    encryptedText: encryptedText.toString("base64"),
    extra: "",
  };
};

export const decryptText = (
  {
    encryptedAesKey,
    encryptedText,
    initVector,
    authTag,
  }: z.output<typeof encryptedBoxSchema>,
  privateKey: crypto.KeyObject,
) => {
  const symmetricKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encryptedAesKey, "base64"),
  );
  return decipherSymmetric({
    key: symmetricKey,
    initVector: Buffer.from(initVector, "base64"),
    authTag: Buffer.from(authTag, "base64"),
    encryptedText: Buffer.from(encryptedText, "base64"),
  });
};
