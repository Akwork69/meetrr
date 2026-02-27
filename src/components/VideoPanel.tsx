import { useEffect, useRef } from "react";
import { VideoOff } from "lucide-react";

interface VideoPanelProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}

const VideoPanel = ({ stream, label, muted = false }: VideoPanelProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current || !stream) return;

    const video = videoRef.current;
    video.srcObject = stream;

    const tryPlay = async () => {
      try {
        await video.play();
      } catch {
        // Mobile browsers may block autoplay with audio.
        video.muted = true;
        await video.play().catch(() => undefined);
      }
    };

    void tryPlay();

    return () => {
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    }
  }, [stream]);

  return (
    <div className="relative flex-1 min-h-0 bg-card rounded-lg overflow-hidden border border-border">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="w-full h-full object-contain bg-black"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <VideoOff className="w-12 h-12 text-muted-foreground" />
          <span className="text-muted-foreground text-sm font-body">
            {label === "You" ? "Camera off" : "Waiting for stranger..."}
          </span>
        </div>
      )}
      <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-md">
        <span className="text-xs font-display text-foreground">{label}</span>
      </div>
    </div>
  );
};

export default VideoPanel;
