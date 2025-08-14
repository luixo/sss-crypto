import type React from "react";
import { expect, test, describe, assert, vi } from "vitest";
import { dryRun, parse } from "cmd-ts";
import { render as renderTesting } from "ink-testing-library";
import chalk from "chalk";

import { createProgram } from "~/index";

const testPublicKey = {
  kty: "RSA",
  n: "uYhrbkT7QoqASq8rinJtywveMcM_X-Tf56fn755uW5C3_or4rFJypXiwSjivTcisdow_Q6NgOKUbsK_iG9sHw21N3UPS_u_Fb2DQl6V_kpqXF2WtvRDR_LA97sG5-0dxk9SY3paxWAQlSz8bIvIhnxfz4lklPvghfpIva_ueXqo9v4J3rIAWftADr1H7UABOLgoPxAaPd9V2HhTljGxxj07C0OQI49yOdteQ2nx3I9GoIG7Ne1BpMGSQZsIp2y5zg0B802B-KIJNe60EMCiMdrZ5QPR3zql_ig-8dPyZvNP_JX_yxwhyvys0guSjpn-y4RkS5J_sLImuj1FCKMz1ZQ",
  e: "AQAB",
};
const testPrivateKey = {
  kty: "RSA",
  n: "ziZT-Knfpqtc-IocvW4dCxXUhhCWzCvGvSg-qi2Pr1quacT2r867DDbqSIecP-b6gzpP5AYmAKJ27SLaP55lpdqS2g0DE5UUCl_YfyEfOqaB04xpfDEMbIAosp2H81DM9tZko-ik8VoEwXMIKjQWiQdOgYAfSUE4ZBgPJDr2FQrWBgxMZlktPexu6NadhXmFWJ3L1QARnoowsVmr12mJ2XnZVYOKrOTg5-UD0jsgHjA7Bmtpdwu0kixwHK21P8PqC_rrBPnF4P9tZAJb22VDt0l06ktqGF3XpW8-_GSZHd5zdJyrwekXXS3yPBgMJnBJ7PH21qDRYoA8hSfdDuiQLw",
  e: "AQAB",
  d: "C0o2aL9mPrqoJaUWttnMIGUf1anHQG5DUkJdJYpyPIsYUzWUwa3DjliG6IBOHS0kBMIm9EN78FFKzGjkuqg3mTzeXwUTE-RNtoBnmxVwIDup5NvjPl3HTZKP6Ab665HoxQ9FGrmX0u9NpF84OsDN3ST3y919mSWdFio_0LROnCSkTagr_SFMNsFzvG8dLKueDZXKK0aUykhC6ecPTAJG80a_fZb5T5BKzz0kc_8BR-Es-p-s3N2x3979zyPHfPIZDnl68HT2QnEw_o5ueGzuUQZCd3jnbxXj3VrCJWSRwEYzFEK1SeUA2GSmKMxYRsJZIIC_BwikUpB8ahYQJD4g1Q",
  p: "__lD1Qzqb7JQsMjZU0zuLneFax3gd1vZNyXlOnXIuU73YimR2DqH8d-pG5mw_vbbuBXy9CcYOgDZ4aHACyNaoFUviD0DmHKw6qmjm30AtsYEq37UOwj6cXW_YcKN2ttCWYz__68S-C22no3D2lrDsRQJr6M_pfx-me2j91UcHeM",
  q: "zivAieVyyAzZxdwrWMNPvh7pAuGy7t_dpXnEmUuMLjxJa-nsPGBMYiA9Ef74haLVcV8xWPIL8DDmTpAeIhOk2076K3jznjo-DQLOhFiujrqRfIObThyAQQUe2NQf9fDr6cxhd-EsQRuyiQ9nJmNQ1Sz8VJP9d2SqNAINwPihFkU",
  dp: "XxggXhblRUeueG61Zh_vYG3gr_GygUUrBjTa2wQE5Or0NpCQ8Q6VkILx1SIcwiu9Zr8ouhGIC4xjZVJtAPZKZcQf23InUsxQ82zALjSbPkuEUp3UhHYKbHo89jmL76GDHbenJzrIRlDdRjwOZaFQkAmMq6ZvL-AEvHSvdGQ3BNc",
  dq: "ul7spvsGfna3adf0S0ILVNcGVfeG088EwvBHWzfi2WzgBjAowA9hHRb9fcYaDFu9TMX7iucLCa56kqxOwQk27pT_KssklnUZ4JMX8qVj7lwS5hbmDn9PJPenAeUHm0CVUfzSYxbm9Vg_VQzaduYyjPIki6RX7VTPU0JEApv-qm0",
  qi: "pLXCaT5sr1KATAwADyzgrHCn3x0yBZ_Bl-355ZTGB657WYx2AmqX2ypFPMCHKHLEN9X995ETcUdpxY0FWLRsmsCeAUhnYatpkKw1FZsPty6oXqFgLZ2bfsi6KP27HUV6774UWriikg719-sloxQ7pMIACZ3IJFL2V8ie5u2GhMc",
};

vi.mock("ink", async (importActual) => ({
  ...(await importActual<typeof import("ink")>()),
  render: (tree: React.ReactElement) => {
    const result = renderTesting(tree);
    return {
      ...result,
      waitUntilExit: async () => {
        let lastFrame = "";
        let nextFrame = result.lastFrame() ?? "";
        while (lastFrame !== nextFrame) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, 1);
          });
          lastFrame = nextFrame;
          nextFrame = result.lastFrame() ?? "";
        }
        result.unmount();
        return nextFrame;
      },
    };
  },
}));
vi.mock("node:crypto", async (importActual) => {
  const actualModule = await importActual<typeof import("node:crypto")>();
  return {
    ...actualModule,
    generateKeyPair: ((_t, _o, callback) => {
      const privateKey = actualModule.createPrivateKey({
        format: "jwk",
        key: testPrivateKey,
      });
      const publicKey = actualModule.createPublicKey({
        format: "jwk",
        key: testPublicKey,
      });
      // @ts-expect-error This is the expected type
      callback(null, { privateKey, publicKey });
    }) as (typeof actualModule)["generateKeyPair"],
  };
});
vi.mock("secrets.js", async (importActual) => {
  const rawModule = await importActual<typeof import("secrets.js")>();
  const actualModule = (rawModule as unknown as { default: typeof rawModule })
    .default;
  const augmentedModule = {
    ...actualModule,
    extractShareComponents: (share: string) => ({
      ...actualModule.extractShareComponents(share),
      data: Buffer.from("share").toString("base64"),
    }),
  };
  return {
    default: augmentedModule,
    "module.exports": augmentedModule,
  };
});

const defaultParseContext: Parameters<
  ReturnType<typeof createProgram>["printHelp"]
>[0] = { nodes: [], visitedNodes: new Set() };
const parseProgram = async (input: string) => {
  const cli = createProgram();
  const parsingResult = await parse(cli, input.split(" "));
  // eslint-disable-next-line no-underscore-dangle
  if (parsingResult._tag === "ok") {
    return { type: "success" as const, value: parsingResult.value };
  }
  return {
    type: "error" as const,
    error: parsingResult.error.errors.map((error) => error.message),
  };
};

describe("encrypt", () => {
  test("prints help", () => {
    const cli = createProgram();
    expect(cli.cmds.encrypt.printHelp(defaultParseContext))
      .toMatchInlineSnapshot(`
      "${chalk.bold("encrypt")}
      ${chalk.dim("> ")}Encrypt a message with a given public key

      OPTIONS:
        --pub, -p <pubKey>  - path to a file to encrypt${chalk.dim(" [optional]")}
        --input, -i <input> - path to a file to encrypt${chalk.dim(" [optional]")}

      FLAGS:
        --help, -h - show help"
    `);
  });

  describe("valid", () => {
    test("default public key, default input", async () => {
      const parseResult = await parseProgram("encrypt");
      assert(parseResult.type === "success");
      expect(parseResult.value).toEqual({
        command: "encrypt",
        args: { pub: "pub.key" },
      });
    });

    test("explicit public key", async () => {
      const parseResult = await parseProgram("encrypt -p specific.key");
      assert(parseResult.type === "success");
      expect(parseResult.value).toEqual({
        command: "encrypt",
        args: { pub: "specific.key" },
      });
    });

    test("explicit input", async () => {
      const parseResult = await parseProgram(
        "encrypt -p specific.key -i file.txt",
      );
      assert(parseResult.type === "success");
      expect(parseResult.value).toEqual({
        command: "encrypt",
        args: { pub: "specific.key", input: "file.txt" },
      });
    });
  });
});

describe("decrypt", () => {
  test("prints help", () => {
    const cli = createProgram();
    expect(cli.cmds.decrypt.printHelp(defaultParseContext))
      .toMatchInlineSnapshot(`
      "${chalk.bold("decrypt")}
      ${chalk.dim("> ")}Decrypt a message with k out of n shares

      OPTIONS:
        --input, -i <input> - path to a file to decrypt

      FLAGS:
        --help, -h - show help"
    `);
  });

  describe("invalid", () => {
    test("empty", async () => {
      const parseResult = await parseProgram("decrypt");
      assert(parseResult.type === "error");
      expect(parseResult.error).toEqual(["No value provided for --input"]);
    });
  });

  describe("valid", () => {
    test("decrypt file passed", async () => {
      const parseResult = await parseProgram("decrypt -i file.txt");
      assert(parseResult.type === "success");
      expect(parseResult.value).toEqual({
        command: "decrypt",
        args: { input: "file.txt" },
      });
    });
  });
});

describe("generate shares", () => {
  test("prints help", () => {
    const cli = createProgram();
    expect(cli.cmds["generate-shares"].printHelp(defaultParseContext))
      .toMatchInlineSnapshot(`
      "${chalk.bold("generate-shares")}
      ${chalk.dim("> ")}Generate n out of k keys via Shamir's secret sharing scheme

      OPTIONS:
        --threshold, -k <threshold> - threshold of shared parts required to be combined to a key
        --shares, -n <shares>       - total amount of shared parts
        --pubOutput, -p <pubOutput> - output filename for a public key${chalk.dim(" [optional]")}

      FLAGS:
        --help, -h - show help"
    `);
  });

  describe("invalid", () => {
    test("no threshold passed", async () => {
      const parseResult = await parseProgram("generate-shares");
      assert(parseResult.type === "error");
      expect(parseResult.error).toEqual([
        "No value provided for --threshold",
        "No value provided for --shares",
      ]);
    });

    test("no shares passed", async () => {
      const parseResult = await parseProgram("generate-shares -k 2");
      assert(parseResult.type === "error");
      expect(parseResult.error).toEqual(["No value provided for --shares"]);
    });
  });

  describe("valid", () => {
    test("threshold and shares passed", async () => {
      const parseResult = await parseProgram("generate-shares -k 2 -n 10");
      assert(parseResult.type === "success");
      expect(parseResult.value).toEqual({
        command: "generate-shares",
        args: { pubOutput: undefined, shares: 10, threshold: 2 },
      });
    });

    test("threshold, shares and pubOutput passed", async () => {
      const parseResult = await parseProgram(
        "generate-shares -k 2 -n 10 -p my-pub.key",
      );
      assert(parseResult.type === "success");
      expect(parseResult.value).toEqual({
        command: "generate-shares",
        args: { pubOutput: "my-pub.key", shares: 10, threshold: 2 },
      });
    });
  });
});

describe("add share", () => {
  test("prints help", () => {
    const cli = createProgram();
    expect(cli.cmds["add-share"].printHelp(defaultParseContext))
      .toMatchInlineSnapshot(`
      "${chalk.bold("add-share")}
      ${chalk.dim("> ")}Add a new share

      OPTIONS:
        --amount, -n <amount> - amount of newly added shares${chalk.dim(" [optional]")}

      FLAGS:
        --help, -h - show help"
    `);
  });

  describe("valid", () => {
    test("empty", async () => {
      const parseResult = await parseProgram("add-share");
      assert(parseResult.type === "success");
      expect(parseResult.value).toEqual({
        command: "add-share",
        args: { amount: 1 },
      });
    });
  });
});

describe("general", () => {
  test("prints help", () => {
    const cli = createProgram();
    expect(cli.printHelp(defaultParseContext)).toMatchInlineSnapshot(`
      "${chalk.bold(`cli${chalk.italic(" <subcommand>")}`)}

      where ${chalk.italic("<subcommand>")} can be one of:

      ${chalk.dim("- ")}generate-shares - Generate n out of k keys via Shamir's secret sharing scheme
      ${chalk.dim("- ")}decrypt - Decrypt a message with k out of n shares
      ${chalk.dim("- ")}add-share - Add a new share
      ${chalk.dim("- ")}encrypt - Encrypt a message with a given public key

      ${chalk.dim(`For more help, try running \`${chalk.yellow(`cli <subcommand> --help`)}\``)}"
    `);
  });

  test("runs", async () => {
    const cli = createProgram();
    const result = await dryRun(cli, "generate-shares -n 5 -k 3".split(" "));
    // eslint-disable-next-line no-underscore-dangle
    assert(result._tag === "ok");
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const frame = await result.value.value;
    expect(frame).toMatchInlineSnapshot(`
      "${chalk.yellow("! Save this data, it will be erased when you close the terminal !")}

      ${chalk.cyan("Public key")}
      -----BEGIN RSA PUBLIC KEY-----
      MIIBCgKCAQEAuYhrbkT7QoqASq8rinJtywveMcM/X+Tf56fn755uW5C3/or4rFJy
      pXiwSjivTcisdow/Q6NgOKUbsK/iG9sHw21N3UPS/u/Fb2DQl6V/kpqXF2WtvRDR
      /LA97sG5+0dxk9SY3paxWAQlSz8bIvIhnxfz4lklPvghfpIva/ueXqo9v4J3rIAW
      ftADr1H7UABOLgoPxAaPd9V2HhTljGxxj07C0OQI49yOdteQ2nx3I9GoIG7Ne1Bp
      MGSQZsIp2y5zg0B802B+KIJNe60EMCiMdrZ5QPR3zql/ig+8dPyZvNP/JX/yxwhy
      vys0guSjpn+y4RkS5J/sLImuj1FCKMz1ZQIDAQAB
      -----END RSA PUBLIC KEY-----

      ${chalk.green("Share #1")}
      3|8|1|wg==

      ${chalk.green("Share #2")}
      3|8|2|wg==

      ${chalk.green("Share #3")}
      3|8|3|wg==

      ${chalk.green("Share #4")}
      3|8|4|wg==

      ${chalk.green("Share #5")}
      3|8|5|wg==


      "
    `);
  });
});
