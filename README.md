# Shamir's secret sharing crypto

## About

This is a helper utility to generate a private key split in `n` shares that can be later reassembled via `k` of them to decrypt a document. Is uses an implementation of [Shamir's threshold secret sharing scheme](http://en.wikipedia.org/wiki/Shamir's_Secret_Sharing) in JavaScript (with the help of [secrets.js](https://github.com/grempe/secrets.js) library).

## Workflow

The general use case looks like this:

1. Alice generates a public / private key pair with a private key splitted in `n` shares and public key saved non-securely (e.g. `yarn start generate-shares -k 3 -n 5`)
1. Alice sends `n` shares to Bobs to let them decrypt her message later.
1. Alice encrypts data with an encryption tool and public key saved in share generation step (e.g. `yarn start encrypt < data-to-encrypt.txt`) and send encrypted data to Bobs.
1. Bobs collect at least `k` shares to decrypt the data (e.g. `yarn start decrypt < encrypted-data.txt`, follow instructions in CLI).

## Security concerns

The only piece of data considered vulnerable in the flow is the generated private key.
It is held in the memory only while in the generating shares process and can be retrieved given `k` out of `n` shares are known.
Generally, stdio is considered a secure location, but you should clear the terminal as long as shares are being sent to shareholders.
