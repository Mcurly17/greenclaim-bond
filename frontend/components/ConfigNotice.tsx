import { CONFIG_ISSUES } from "@/lib/config";

export function ConfigNotice() {
  if (CONFIG_ISSUES.length === 0) return null;
  return (
    <div role="alert" className="fixed inset-x-0 bottom-0 z-50 border-t border-red-400/40 bg-red-950/90 px-4 py-2 text-center text-sm text-red-100">
      {CONFIG_ISSUES.map((issue) => (
        <p key={issue}>{issue}</p>
      ))}
      <p className="text-red-200/80">Reads and transactions are disabled until the build is configured.</p>
    </div>
  );
}
