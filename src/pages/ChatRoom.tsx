import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SkipForward, PhoneOff, Zap, Video, VideoOff, Mic, MicOff } from "lucide-react";
import VideoPanel from "@/components/VideoPanel";
import ChatPanel from "@/components/ChatPanel";
import { useWebRTC } from "@/hooks/useWebRTC";

const ChatRoom = () => {
  const navigate = useNavigate();
  const {
    status,
    localStream,
    remoteStream,
    messages,
    startSearching,
    sendMessage,
    disconnect,
    skip,
    getLocalStream,
    setCameraEnabled,
  } = useWebRTC();

  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const startedRef = useRef(false);
  const reconnectingRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    getLocalStream().then(() => startSearching());
  }, [getLocalStream, startSearching]);

  useEffect(() => {
    const hasEnabledVideo = Boolean(localStream?.getVideoTracks().some((t) => t.enabled));
    setCameraOn(hasEnabledVideo);
  }, [localStream]);

  useEffect(() => {
    if (status !== "disconnected" || reconnectingRef.current) return;
    reconnectingRef.current = true;

    const timer = setTimeout(() => {
      void startSearching().finally(() => {
        reconnectingRef.current = false;
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [status, startSearching]);

  const toggleCamera = async () => {
    const next = !cameraOn;
    const applied = await setCameraEnabled(next);
    if (applied) setCameraOn(next);
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
      setMicOn((v) => !v);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    navigate("/");
  };

  const statusText: Record<string, string> = {
    idle: "Ready",
    searching: "Looking for a stranger...",
    connecting: "Connecting...",
    connected: "Connected to a stranger!",
    disconnected: "Stranger disconnected",
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={() => navigate("/")} className="flex items-center gap-2" type="button">
          <Zap className="w-5 h-5 text-primary" />
          <span className="font-display font-bold text-foreground text-lg">
            meet<span className="text-primary">rr</span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              status === "connected" ? "bg-primary" : status === "searching" ? "bg-yellow-500 animate-pulse" : "bg-muted-foreground"
            }`}
          />
          <span className="text-sm text-muted-foreground font-body">{statusText[status]}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggleCamera}
            className={`p-2 rounded-lg text-sm transition-opacity ${
              cameraOn ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"
            }`}
            title={cameraOn ? "Turn camera off" : "Turn camera on"}
          >
            {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleMic}
            className={`p-2 rounded-lg text-sm transition-opacity ${
              micOn ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"
            }`}
            title={micOn ? "Mute mic" : "Unmute mic"}
          >
            {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
          <button
            onClick={skip}
            className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-display hover:opacity-80 transition-opacity"
          >
            <SkipForward className="w-4 h-4" />
            Next
          </button>
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg text-sm font-display hover:opacity-80 transition-opacity"
          >
            <PhoneOff className="w-4 h-4" />
            Stop
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 p-3 gap-3">
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <VideoPanel stream={remoteStream} label="Stranger" />
          <VideoPanel stream={localStream} label="You" muted />
        </div>

        <div className="w-80 hidden md:flex">
          <ChatPanel
            messages={messages}
            onSend={sendMessage}
            disabled={status !== "connected"}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
