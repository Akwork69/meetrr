import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Video, VideoOff, Zap } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [cameraOn, setCameraOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const ensureCameraOn = async () => {
    if (stream && stream.getVideoTracks().some((t) => t.readyState === "live")) {
      setCameraOn(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
      setCameraOn(true);
    } catch (e) {
      console.error("Camera access denied:", e);
      setCameraOn(false);
    }
  };

  useEffect(() => {
    void ensureCameraOn();
  }, []);

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

        {/* Controls */}
        <div className="flex gap-3">
          <button
            onClick={ensureCameraOn}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-display transition-opacity ${
              cameraOn
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
            disabled={cameraOn}
          >
            {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            {cameraOn ? "Camera On (Required)" : "Enable Camera"}
          </button>
        </div>

        <button
          type="button"
          disabled={!cameraOn}
          onClick={() => cameraOn && navigate("/chat")}
          className={`inline-flex items-center gap-2 font-display font-bold text-lg px-8 py-4 rounded-lg transition-all ${
            cameraOn
              ? "bg-primary text-primary-foreground hover:opacity-90 animate-pulse-glow"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
          }`}
        >
          <Video className="w-5 h-5" />
          {cameraOn ? "Start Chatting" : "Enable Camera to Start"}
        </button>

        <p className="text-muted-foreground text-xs font-body">
          By using meetrr, you accept our community guidelines.
        </p>
      </div>
    </div>
  );
};

export default Index;
