import { useEffect, useState } from 'react';

type Props = { 
  basePath: string; 
  workerReady: boolean;
}

export default function Diagnostics({ basePath, workerReady }: Props) {
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
    <span className={`px-2 py-0.5 text-xs rounded-full ${
      ok === null 
        ? 'bg-muted text-muted-foreground' 
        : ok 
          ? 'bg-emerald-500/20 text-emerald-300' 
          : 'bg-destructive/20 text-destructive'
    }`}>
      {label}: {ok === null ? '…' : ok ? 'OK' : 'FAIL'}
    </span>
  );

  return (
    <div className="mt-2 flex gap-2 text-xs opacity-80">
      <Pill ok={coreOk} label="FFmpeg Core" />
      <Pill ok={coi ?? null} label="COI" />
      <Pill ok={workerReady} label="Worker" />
    </div>
  );
}