import * as crypto from "node:crypto";

export const generatePair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return { publicKey, privateKey };
};

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

export const encryptText = (
  dataToEncrypt: Buffer,
  publicKey: crypto.KeyObject,
) =>
  crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    dataToEncrypt,
  );

export const decryptText = (
  encryptedData: Buffer,
  privateKey: crypto.KeyObject,
) =>
  crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    encryptedData,
  );
