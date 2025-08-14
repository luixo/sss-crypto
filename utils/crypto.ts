import * as crypto from "node:crypto";
import { promisify } from "node:util";
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

export const deserializeEncryptedData = (encryptedBox: string) => {
  const [tag, initVector, authTag, encryptedAesKey, encryptedText, ...rest] =
    encryptedBox.split("|").map((element) => element.replaceAll(/\s/g, ""));
  if (!tag || tag !== brandingTag) {
    throw new Error(
      `Data is invalid, expected data with "${brandingTag}" prefix.`,
    );
  }
  if (!initVector) {
    throw new Error("No initial vector on decryption.");
  }
  const initialVectorLength = getBase64ByteLength(initVectorBytes);
  if (initVector.length !== initialVectorLength) {
    throw new Error(
      `Initial vector has to have length of ${initialVectorLength} bytes.`,
    );
  }
  if (!authTag) {
    throw new Error("No auth tag on decryption.");
  }
  const authTagLength = getBase64ByteLength(authTagBytes);
  if (authTag.length !== authTagLength) {
    throw new Error(`Auth tag has to have length of ${authTagLength} bytes.`);
  }
  if (!encryptedAesKey) {
    throw new Error("No RSA encrypted key on decryption.");
  }
  const aesKeyLength = getBase64ByteLength(symmetricEncryptionBytes);
  if (encryptedAesKey.length !== aesKeyLength) {
    throw new Error(
      `Encrypted AES key has to have length of ${aesKeyLength} bytes.`,
    );
  }
  if (!encryptedText) {
    throw new Error("No text to decrypt on decryption.");
  }
  if (rest.length > 0) {
    throw new Error("Extra data on decryption.");
  }
  return {
    authTag: sanitizeBase64(authTag),
    initVector: sanitizeBase64(initVector),
    encryptedText: sanitizeBase64(encryptedText),
    encryptedAesKey: sanitizeBase64(encryptedAesKey),
  };
};
export type EncryptedData = ReturnType<typeof deserializeEncryptedData>;
export const serializeEncryptedData = ({
  authTag,
  initVector,
  encryptedAesKey,
  encryptedText,
}: EncryptedData) =>
  [brandingTag, initVector, authTag, encryptedAesKey, encryptedText].join("|");

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
): EncryptedData => {
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
    authTag: authTag.toString("base64"),
    initVector: initVector.toString("base64"),
    encryptedAesKey: encryptedAesKey.toString("base64"),
    encryptedText: encryptedText.toString("base64"),
  };
};

export const decryptText = (
  { encryptedAesKey, encryptedText, initVector, authTag }: EncryptedData,
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
