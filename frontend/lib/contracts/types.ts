/**
 * TypeScript types shared by the frontend.
 */

export interface TransactionReceipt {
  status: string;
  hash: string;
  blockNumber?: number;
  [key: string]: any;
}
