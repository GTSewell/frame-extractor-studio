import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, TriangleAlert } from "lucide-react";
import { estimateFramesAndZip, humanBytes } from "@/lib/estimate";
import type { FileMetadata, ExtractionSettings } from "@/lib/types";

type Props = {
  metadata: FileMetadata | null;
  settings: ExtractionSettings;
};

export default function EstimateNotice({ metadata, settings }: Props) {
  if (!metadata) return null;

  const est = estimateFramesAndZip(metadata, settings);

  const bigJob = est.frames > 2000 || est.sizeBytesMid > 1.5 * 1024 * 1024 * 1024; // > ~1.5 GB
  const title = bigJob ? "Large job warning" : "Estimated output";
  const Icon = bigJob ? TriangleAlert : Info;

  const dims = `${est.dims.width}×${est.dims.height}`;
  const zipRange = `${humanBytes(est.sizeBytesLow)}–${humanBytes(est.sizeBytesHigh)}`;

  // Helpful tip to reduce size
  let tip: string | null = null;
  if (bigJob) {
    if (settings.mode === 'every') {
      tip = "Tip: switch to FPS mode (e.g., 5 fps) or set a shorter time range.";
    } else if (settings.mode === 'fps') {
      tip = "Tip: lower the FPS or set a shorter time range.";
    } else if (settings.mode === 'nth') {
      tip = "Tip: increase N (e.g., every 5th or 10th frame) or shorten the range.";
    } else {
      tip = "Tip: set a shorter time range to reduce the number of frames.";
    }
  }

  return (
    <Alert className={bigJob ? "border-destructive/40" : ""}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <div className="space-y-1">
          <div>
            Estimated: <b>{est.frames.toLocaleString()} frames</b> @ <b>{dims}</b>{" "}
            → ZIP ~ <b>{zipRange}</b>{" "}
            <span className="opacity-70">
              ({settings.outputFormat?.type?.toUpperCase() ?? "PNG"})
            </span>
          </div>
          <div className="text-xs opacity-70">
            Duration considered: {est.durationSec.toFixed(2)}s · Assumed FPS: {est.assumedFps}
          </div>
          {est.notes.length > 0 && (
            <div className="text-xs opacity-70">
              {est.notes.map((n, i) => (
                <span key={i}>{n}{i < est.notes.length - 1 ? " · " : ""}</span>
              ))}
            </div>
          )}
          {tip && <div className="text-sm font-medium text-foreground mt-2">{tip}</div>}
        </div>
      </AlertDescription>
    </Alert>
  );
}