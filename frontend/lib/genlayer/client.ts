"use client";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";
import { CONFIG } from "@/lib/config";

export const GENLAYER_CHAIN_ID = CONFIG.chainId;
export const GENLAYER_CHAIN_ID_HEX = CONFIG.chainIdHex;

export const GENLAYER_NETWORK = {
  chainId: GENLAYER_CHAIN_ID_HEX,
  chainName: CONFIG.chainName,
  nativeCurrency: {
    name: CONFIG.symbol,
    symbol: CONFIG.symbol,
    decimals: 18,
  },
  rpcUrls: [CONFIG.rpcUrl],
  blockExplorerUrls: [CONFIG.explorerUrl],
};

/** Any EIP-1193 provider injected by a browser wallet (Rabby, MetaMask, ...). */
interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * Get the GenLayer RPC URL used for reads, receipts and the wallet network entry.
 */
export function getStudioUrl(): string {
  return CONFIG.rpcUrl;
}

export const NO_WALLET_MESSAGE = "No browser wallet found. Install a wallet extension, then reload this page.";
export const WALLET_INSTALL_URL = "https://ethereum.org/en/wallets/find-wallet/";

/** True when any wallet injected window.ethereum; no wallet brand is checked. */
export function hasInjectedWallet(): boolean {
  return getEthereumProvider() !== null;
}

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum || null;
}

/**
 * Ask the wallet for access to its accounts.
 * @returns Array of addresses
 */
export async function requestAccounts(): Promise<string[]> {
  const provider = getEthereumProvider();

  if (!provider) {
    throw new Error(NO_WALLET_MESSAGE);
  }

  try {
    const accounts = await provider.request({
      method: "eth_requestAccounts",
    });
    return accounts;
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error("User rejected the connection request");
    }
    throw new Error(`Failed to connect to your wallet: ${error.message}`);
  }
}

/**
 * Get the wallet's current accounts without requesting permission
 * @returns Array of addresses
 */
export async function getAccounts(): Promise<string[]> {
  const provider = getEthereumProvider();

  if (!provider) {
    return [];
  }

  try {
    const accounts = await provider.request({
      method: "eth_accounts",
    });
    return accounts;
  } catch (error) {
    console.error("Error getting accounts:", error);
    return [];
  }
}

/**
 * Get the wallet's current chain ID
 */
export async function getCurrentChainId(): Promise<string | null> {
  const provider = getEthereumProvider();

  if (!provider) {
    return null;
  }

  try {
    const chainId = await provider.request({
      method: "eth_chainId",
    });
    return chainId;
  } catch (error) {
    console.error("Error getting chain ID:", error);
    return null;
  }
}

/**
 * Add the GenLayer network to the wallet
 */
export async function addGenLayerNetwork(): Promise<void> {
  const provider = getEthereumProvider();

  if (!provider) {
    throw new Error(NO_WALLET_MESSAGE);
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [GENLAYER_NETWORK],
    });
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error("User rejected adding the network");
    }
    throw new Error(`Failed to add GenLayer network: ${error.message}`);
  }
}

/**
 * Switch to GenLayer network
 */
export async function switchToGenLayerNetwork(): Promise<void> {
  const provider = getEthereumProvider();

  if (!provider) {
    throw new Error(NO_WALLET_MESSAGE);
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });
  } catch (error: any) {
    // If the chain is not added, add it
    if (error.code === 4902) {
      await addGenLayerNetwork();
    } else if (error.code === 4001) {
      throw new Error("User rejected switching the network");
    } else {
      throw new Error(`Failed to switch network: ${error.message}`);
    }
  }
}

/**
 * Check if we're on the GenLayer network
 */
export async function isOnGenLayerNetwork(): Promise<boolean> {
  const chainId = await getCurrentChainId();

  if (!chainId) {
    return false;
  }

  // Convert both to decimal for comparison
  const currentChainIdDecimal = parseInt(chainId, 16);
  return currentChainIdDecimal === GENLAYER_CHAIN_ID;
}

/**
 * Connect the injected wallet and ensure it is on the GenLayer network
 * @returns The connected address
 */
export async function connectInjectedWallet(): Promise<string> {
  if (!hasInjectedWallet()) {
    throw new Error(NO_WALLET_MESSAGE);
  }

  // Request accounts
  const accounts = await requestAccounts();

  if (!accounts || accounts.length === 0) {
    throw new Error("No accounts found");
  }

  // Check and switch to GenLayer network
  const onCorrectNetwork = await isOnGenLayerNetwork();

  if (!onCorrectNetwork) {
    await switchToGenLayerNetwork();
  }

  return accounts[0];
}

/**
 * Ask the wallet to pick another account, even if already connected
 * (wallet_requestPermissions opens the account selection dialog)
 * @returns The newly selected account address
 */
export async function switchAccount(): Promise<string> {
  const provider = getEthereumProvider();

  if (!provider) {
    throw new Error(NO_WALLET_MESSAGE);
  }

  try {
    // Request permissions - this shows account picker
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });

    // Get the newly selected account
    const accounts = await provider.request({
      method: "eth_accounts",
    });

    if (!accounts || accounts.length === 0) {
      throw new Error("No account selected");
    }

    return accounts[0];
  } catch (error: any) {
    if (error.code === 4001) {
      throw new Error("User rejected account switch");
    } else if (error.code === -32002) {
      throw new Error("Account switch request already pending");
    }
    throw new Error(`Failed to switch account: ${error.message}`);
  }
}

// genlayer-js 1.1.8 overwrites `chain.rpcUrls` when given an endpoint, so each
// client gets its own copy instead of mutating the shared preset.
function configuredChain(): GenLayerChain {
  return {
    ...studionet,
    id: CONFIG.chainId,
    rpcUrls: { default: { http: [CONFIG.rpcUrl] } },
    blockExplorers: { default: { name: "GenLayer Studio Explorer", url: CONFIG.explorerUrl } },
  };
}

/**
 * Create a GenLayer client on the configured RPC. With an address, signing
 * requests go to the injected wallet (window.ethereum); no key is ever handled.
 */
export function createGenLayerClient(address?: `0x${string}`) {
  return createClient({
    chain: configuredChain(),
    endpoint: CONFIG.rpcUrl,
    ...(address ? { account: address } : {}),
  });
}
