import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Video, VideoOff, Zap } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [cameraOn, setCameraOn] = useState(false);
  const [warning, setWarning] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const ensureCameraOn = async (): Promise<MediaStream | null> => {
    if (stream && stream.getVideoTracks().some((t) => t.readyState === "live")) {
      setCameraOn(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
      return stream;
    }

    const mediaDevices = navigator?.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
      setCameraOn(false);
      return null;
    }

    try {
      const s = await mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(s);
      const video = videoRef.current;
      if (video) {
        video.srcObject = s;
        await video.play().catch(() => undefined);
      }
      setCameraOn(true);
      return s;
    } catch (e) {
      console.error("Camera access denied:", e);
      setCameraOn(false);
      return null;
    }
  };

  useEffect(() => {
    void ensureCameraOn();
  }, []);

  const hasVisibleCameraPreview = async (activeStream: MediaStream): Promise<boolean> => {
    const track = activeStream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") {
      return false;
    }

    const video = videoRef.current;
    if (!video) {
      return false;
    }

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 1500);
      const onLoadedData = () => {
        clearTimeout(timeout);
        resolve(video.videoWidth > 0 && video.videoHeight > 0);
      };
      video.addEventListener("loadeddata", onLoadedData, { once: true });
    });
  };

  const handleStartChatting = async () => {
    setWarning("");
    const activeStream = await ensureCameraOn();
    if (!activeStream) {
      setWarning("Camera permission is required to start chatting.");
      return;
    }

    const visible = await hasVisibleCameraPreview(activeStream);
    if (!visible) {
      setCameraOn(false);
      setWarning("Camera feed is not visible. Please allow camera access and try again.");
      return;
    }

    setCameraOn(true);
    navigate("/chat");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Scanline overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
        <div className="w-full h-[200%] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,hsl(var(--foreground))_2px,hsl(var(--foreground))_4px)] animate-scan-line" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        <div className="flex items-center gap-3">
          <Zap className="w-8 h-8 text-primary" />
          <h1 className="text-5xl md:text-7xl font-display font-bold text-foreground tracking-tight">
            meet<span className="text-primary text-glow">rr</span>
          </h1>
        </div>

        <p className="text-muted-foreground font-body text-lg text-center max-w-md">
          Talk to strangers. Video chat with random people around the world.
        </p>

        {/* Camera preview */}
        <div className="relative w-72 h-52 rounded-lg overflow-hidden border border-border glow">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-card">
              <VideoOff className="w-10 h-10 text-muted-foreground" />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleStartChatting}
          className={`inline-flex items-center gap-2 font-display font-bold text-lg px-8 py-4 rounded-lg transition-all ${
            cameraOn
              ? "bg-primary text-primary-foreground hover:opacity-90 animate-pulse-glow"
              : "bg-secondary text-secondary-foreground hover:opacity-90"
          }`}
        >
          <Video className="w-5 h-5" />
          Start Chatting
        </button>
        {warning && (
          <p className="text-destructive text-sm font-body text-center max-w-md">
            {warning}
          </p>
        )}

        <p className="text-muted-foreground text-xs font-body">
          By using meetrr, you accept our community guidelines.
        </p>
      </div>
    </div>
  );
};

export default Index;
