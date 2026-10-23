// Calls GreenClaim Bond methods, including the payable ones: the `genlayer` CLI
// cannot attach a message value to `write`.
//
//   npm run greenclaim -- <command> [args...]
//
// Configuration comes from the environment (.env, gitignored; see .env.example).
import { readFileSync } from "node:fs";
import type {
  Address,
  CalldataEncodable,
  DecodedDeployData,
  GenLayerChain,
  TransactionHash,
} from "genlayer-js/types";

const CONTRACT_PATH = "contracts/green_claim_bond.py";

// Hosted Studio does not decode transactions built by genlayer-js 2.0.0-rc.2, and only
// that release ships the Bradbury Phase 2 preset: each network gets its own SDK build.
const NETWORKS: Record<string, { sdk: string; chain: string }> = {
  localnet: { sdk: "genlayer-js", chain: "localnet" },
  studionet: { sdk: "genlayer-js", chain: "studionet" },
  "testnet-bradbury": { sdk: "genlayer-js-phase2", chain: "testnetBradbury" },
};

const EXECUTION_OK = new Set(["FINISHED_WITH_RETURN", "SUCCESS"]);

const USAGE = `commands:
  deploy                                  (deploys ${CONTRACT_PATH}, prints the address)
  pledge <name> <domain> <payout_gen> <days> <bond_gen> <page_url> [page_url...]
  top-up <pledge_id> <amount_gen>
  challenge <pledge_id> <page_index> <rule> <quote> <snapshot_ts> <stake_gen>
  resolve <challenge_id> | expire <challenge_id> | withdraw <pledge_id>
  pledge-info <pledge_id> | challenge-info <challenge_id> | list <pledge_id>
  standing <brand_address> | stats
env: GENLAYER_NETWORK (${Object.keys(NETWORKS).join(", ")}), GENLAYER_RPC (optional node RPC),
     GREENCLAIM_CONTRACT, GREENCLAIM_SIGNER (1 or 2 -> ACCOUNT_PRIVATE_KEY_<n>)`;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

function gen(amount: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,18}))?$/.exec(amount);
  if (!match) throw new Error(`invalid GEN amount: ${amount}`);
  return BigInt(match[1]) * 10n ** 18n + BigInt((match[2] ?? "").padEnd(18, "0"));
}

function int(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`expected a non-negative integer, got: ${value}`);
  return Number(value);
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

async function connect() {
  const networkName = process.env.GENLAYER_NETWORK ?? "studionet";
  const network = NETWORKS[networkName];
  if (!network) throw new Error(`unknown GENLAYER_NETWORK: ${networkName}`);
  const { createAccount, createClient } = await import(network.sdk);
  const chains = await import(`${network.sdk}/chains`);
  const { TransactionStatus } = await import(`${network.sdk}/types`);
  const chain = chains[network.chain] as GenLayerChain;
  const signer = process.env.GREENCLAIM_SIGNER ?? "1";
  const key = process.env[`ACCOUNT_PRIVATE_KEY_${signer}`];
  const account = key ? createAccount(key as `0x${string}`) : undefined;
  const client = createClient({ chain, endpoint: process.env.GENLAYER_RPC || undefined, account });
  return { client, account, accepted: TransactionStatus.ACCEPTED };
}

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  if (!command || command === "help") {
    console.log(USAGE);
    return;
  }
  const { client, account, accepted } = await connect();
  const contract = () => env("GREENCLAIM_CONTRACT") as Address;

  const read = async (functionName: string, callArgs: CalldataEncodable[] = []) =>
    print(
      await client.readContract({ address: contract(), functionName, args: callArgs, jsonSafeReturn: true }),
    );

  const signer = () => {
    if (!account) throw new Error("no signer key: set ACCOUNT_PRIVATE_KEY_<GREENCLAIM_SIGNER>");
    return account;
  };

  // Studio returns snake_case receipts; testnet nodes return the decoded camelCase shape.
  // Polling only reads the receipt, so a gateway error is retried without resending.
  const settle = async (hash: TransactionHash) => {
    let receipt;
    for (let attempt = 1; ; attempt++) {
      try {
        receipt = await client.waitForTransactionReceipt({ hash, status: accepted, retries: 200 });
        break;
      } catch (error) {
        if (attempt >= 5) throw error;
        console.error(`receipt poll failed for ${hash} (attempt ${attempt}), retrying`);
        await new Promise((done) => setTimeout(done, 5000 * attempt));
      }
    }
    const raw = receipt as Record<string, any>;
    const leader = raw.consensus_data?.leader_receipt?.[0];
    const summary = {
      hash,
      status: raw.statusName ?? raw.status_name,
      consensus: raw.resultName ?? raw.result_name,
      execution: raw.txExecutionResultName ?? leader?.execution_result,
    };
    if (!EXECUTION_OK.has(summary.execution)) process.exitCode = 1;
    return { receipt, summary };
  };

  const write = async (functionName: string, callArgs: CalldataEncodable[], value = 0n) => {
    signer();
    const hash = (await client.writeContract({
      address: contract(),
      functionName,
      args: callArgs,
      value,
    })) as TransactionHash;
    print((await settle(hash)).summary);
  };

  const deploy = async () => {
    signer();
    const code = new Uint8Array(readFileSync(CONTRACT_PATH));
    const hash = (await client.deployContract({ code, args: [] })) as TransactionHash;
    const { receipt, summary } = await settle(hash);
    const decoded = receipt.txDataDecoded as DecodedDeployData | undefined;
    const data = (receipt as { data?: { contract_address?: string } }).data;
    print({ ...summary, contractAddress: data?.contract_address ?? decoded?.contractAddress });
  };

  const need = (count: number) => {
    if (args.length !== count) throw new Error(`${command} expects ${count} arguments\n${USAGE}`);
  };

  switch (command) {
    case "deploy":
      need(0);
      return deploy();
    case "pledge": {
      if (args.length < 6) throw new Error(`pledge expects at least 6 arguments\n${USAGE}`);
      const [name, domain, payout, days, bond, ...pages] = args;
      return write("create_pledge", [name, domain, JSON.stringify(pages), gen(payout), int(days)], gen(bond));
    }
    case "top-up":
      need(2);
      return write("top_up", [int(args[0])], gen(args[1]));
    case "challenge":
      need(6);
      return write("challenge", [int(args[0]), int(args[1]), args[2], args[3], args[4]], gen(args[5]));
    case "resolve":
    case "expire":
      need(1);
      return write(command, [int(args[0])]);
    case "withdraw":
      need(1);
      return write("withdraw", [int(args[0])]);
    case "pledge-info":
      need(1);
      return read("get_pledge", [int(args[0])]);
    case "challenge-info":
      need(1);
      return read("get_challenge", [int(args[0])]);
    case "list":
      need(1);
      return read("list_challenges", [int(args[0])]);
    case "standing":
      need(1);
      return read("standing", [args[0]]);
    case "stats":
      need(0);
      return read("get_stats");
    default:
      throw new Error(`unknown command: ${command}\n${USAGE}`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
