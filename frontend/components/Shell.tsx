import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { ExternalLink } from "@/components/bits";
import { CONFIG, REPO_URL } from "@/lib/config";
import { explorerAddress, studioImport } from "@/lib/links";

export function TestnetBanner() {
  return (
    <div role="note" className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100">
      Testnet demo on {CONFIG.chainName} (chain {CONFIG.chainId}). {CONFIG.symbol} on this network has no
      value. Verdicts come from AI validators applying fixed rules to archived pages; they are not legal advice.
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 py-6 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          {CONFIG.contractAddress ? (
            <p>
              Contract{" "}
              <ExternalLink href={explorerAddress(CONFIG.contractAddress)} className="font-mono">
                {CONFIG.contractAddress}
              </ExternalLink>
            </p>
          ) : (
            <p>No contract configured.</p>
          )}
          <p>Network: {CONFIG.chainName}, chain {CONFIG.chainId}</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/rules/" className="hover:text-accent">
            Rules
          </Link>
          {CONFIG.contractAddress && <ExternalLink href={studioImport(CONFIG.contractAddress)}>Open in Studio</ExternalLink>}
          <ExternalLink href={REPO_URL}>Source code</ExternalLink>
          <ExternalLink href="https://docs.genlayer.com">GenLayer docs</ExternalLink>
        </nav>
      </div>
    </footer>
  );
}

/** Page frame: testnet banner, navigation, content, footer. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="pt-16">
        <TestnetBanner />
      </div>
      <main className="mx-auto w-full max-w-5xl flex-grow px-4 py-8">{children}</main>
      <Footer />
    </div>
  );
}
