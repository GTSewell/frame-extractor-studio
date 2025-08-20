import { useEffect, useState } from 'react';

type Props = { 
  basePath: string; 
  workerAlive: boolean;
  ffmpegReady: boolean;
  lastError?: string | null;
}

export default function Diagnostics({ basePath, workerAlive, ffmpegReady, lastError }: Props) {
  const [coreOk, setCoreOk] = useState<boolean | null>(null);
  const coi = typeof window !== 'undefined' ? (window as any).crossOriginIsolated === true : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [js, wasm] = await Promise.all([
          fetch(`${basePath}/ffmpeg-core.js`, { method: 'HEAD', cache: 'no-cache' }),
          fetch(`${basePath}/ffmpeg-core.wasm`, { method: 'HEAD', cache: 'no-cache' }),
        ]);
        if (!cancelled) setCoreOk(js.ok && wasm.ok);
      } catch {
        if (!cancelled) setCoreOk(false);
      }
    })();
    return () => { cancelled = true; };
  }, [basePath]);

  const Pill = ({ ok, label }: { ok: boolean | null; label: string }) => (
    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
      ok === null 
        ? 'bg-muted text-muted-foreground' 
        : ok 
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
          : 'bg-destructive/20 text-destructive border border-destructive/30'
    }`}>
      {label}: {ok === null ? '…' : ok ? 'OK' : 'FAIL'}
    </span>
  );

  return (
    <div className="mt-2 space-y-2 text-xs">
      <div className="flex gap-2 flex-wrap">
        <Pill ok={coreOk} label="FFmpeg Core" />
        <Pill ok={coi ?? null} label="COI" />
        <Pill ok={workerAlive} label="Worker" />
        <Pill ok={ffmpegReady} label="FFmpeg" />
      </div>
      {!!lastError && (
        <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-destructive/90 text-xs">
          <strong>Error:</strong> {lastError}
        </div>
      )}
      {coi === false && (
        <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-600 dark:text-yellow-400 text-xs">
          <strong>Note:</strong> COI (Cross-Origin Isolation) failed but FFmpeg can still work in single-threaded mode.
        </div>
      )}
      {basePath && (
        <div className="text-muted-foreground text-xs opacity-60">
          Core files: {basePath}/
        </div>
      )}
    </div>
  );
}