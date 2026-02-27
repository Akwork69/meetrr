import { useRef, useState, useCallback, useEffect } from "react";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    // Mobile carriers and restrictive Wi-Fi often require TCP relay.
    urls: "turn:openrelay.metered.ca:80?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    // TLS TURN improves success rates on locked-down networks.
    urls: "turns:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
};

type ConnectionStatus =
  | "idle"
  | "searching"
  | "connecting"
  | "connected"
  | "disconnected"
  | "camera_required"
  | "config_required";
type SignalType = "offer" | "answer" | "ice-candidate" | "invite";

interface SignalPayload {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  partner_id?: string;
}

interface DbSignal {
  id: string;
  sender_id: string;
  type: SignalType;
  payload: SignalPayload;
}

const generateClientId = (): string => {
  const webCrypto = globalThis.crypto;

  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export function useWebRTC() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<{ text: string; from: "me" | "stranger" }[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const myIdRef = useRef<string>(generateClientId());
  const roomRef = useRef<string | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const videoTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanedUpRef = useRef(false);
  const searchInProgressRef = useRef(false);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const enforceAudioConstraints = useCallback(async (stream: MediaStream) => {
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack || typeof audioTrack.applyConstraints !== "function") return;
    try {
      await audioTrack.applyConstraints(AUDIO_CONSTRAINTS);
    } catch (err) {
      console.warn("[meetrr] audio constraints not fully supported:", err);
    }
  }, []);

  // --- Cleanup ---
  const cleanup = useCallback(async () => {
    console.log("[meetrr] cleanup");
    cleanedUpRef.current = true;

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    dataChannelRef.current = null;
    videoSenderRef.current = null;

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const myId = myIdRef.current;
    await supabase.from("waiting_users").delete().eq("user_id", myId);

    // Clean up signals for our room
    if (roomRef.current) {
      await supabase.from("signals").delete().eq("room_id", roomRef.current);
    }

    roomRef.current = null;
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setMessages([]);
  }, []);

  // --- Media ---
  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const mediaDevices = navigator?.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
      throw new Error("camera_required");
    }

    try {
      const stream = await mediaDevices.getUserMedia({ video: true, audio: true });
      const cameraTrack = stream.getVideoTracks()[0];
      if (!cameraTrack) {
        throw new Error("camera_required");
      }
      cameraTrack.enabled = true;
      await enforceAudioConstraints(stream);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn("[meetrr] camera access required for chat:", err);
      throw new Error("camera_required");
    }
  }, [enforceAudioConstraints]);

  // --- Data Channel ---
  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dataChannelRef.current = dc;
    dc.onopen = () => console.log("[meetrr] data channel open");
    dc.onclose = () => console.log("[meetrr] data channel closed");
    dc.onmessage = (e) => {
      setMessages((prev) => [...prev, { text: e.data, from: "stranger" }]);
    };
  }, []);

  // --- Send signal via DB ---
  const sendSignal = useCallback(async (roomId: string, type: SignalType, payload: SignalPayload) => {
    const { error } = await supabase.from("signals").insert({
      room_id: roomId,
      sender_id: myIdRef.current,
      type,
      payload,
    });
    if (error) console.error("[meetrr] signal send error:", error);
    else console.log("[meetrr] sent signal:", type);
  }, []);

  // --- Create Peer Connection ---
  const createPeerConnection = useCallback(
    (stream: MediaStream, roomId: string, isOfferer: boolean) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      const configureVideoTransceiver = (transceiver: RTCRtpTransceiver | null) => {
        if (!transceiver) return;
        videoTransceiverRef.current = transceiver;

        // Prefer H264 for broader cross-device compatibility (notably mobile Safari).
        const getCaps = RTCRtpSender?.getCapabilities;
        if (typeof getCaps !== "function" || typeof transceiver.setCodecPreferences !== "function") {
          return;
        }

        const capabilities = getCaps("video");
        const codecs = capabilities?.codecs ?? [];
        if (!codecs.length) return;

        const h264 = codecs.filter(
          (codec) => codec.mimeType.toLowerCase() === "video/h264" && !/rtx|red|ulpfec/i.test(codec.mimeType)
        );
        if (!h264.length) return;

        const others = codecs.filter((codec) => codec.mimeType.toLowerCase() !== "video/h264");
        transceiver.setCodecPreferences([...h264, ...others]);
      };

      const initialVideoTrack = stream.getVideoTracks()[0];
      if (initialVideoTrack) {
        // Use addTrack for initial camera publish for better mobile browser interop.
        videoSenderRef.current = pc.addTrack(initialVideoTrack, stream);
        const videoTransceiver =
          pc.getTransceivers().find((t) => t.sender === videoSenderRef.current) ??
          pc.getTransceivers().find((t) => t.sender.track?.kind === "video" || t.receiver.track?.kind === "video") ??
          null;
        configureVideoTransceiver(videoTransceiver);
      } else {
        // Reserve a negotiated video sender when camera is unavailable initially.
        const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
        videoSenderRef.current = videoTransceiver.sender;
        configureVideoTransceiver(videoTransceiver);
      }

      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (e) => {
        console.log("[meetrr] remote track received");
        const incomingStream = e.streams[0] ?? remoteStreamRef.current ?? new MediaStream();

        if (!e.streams[0]) {
          const alreadyPresent = incomingStream.getTracks().some((t) => t.id === e.track.id);
          if (!alreadyPresent) {
            incomingStream.addTrack(e.track);
          }
        }

        remoteStreamRef.current = incomingStream;
        setRemoteStream(new MediaStream(incomingStream.getTracks()));
        setStatus("connected");
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(roomId, "ice-candidate", { candidate: e.candidate.toJSON() });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[meetrr] ICE state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setStatus("connected");
        }
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
          setStatus("disconnected");
        }
      };

      if (isOfferer) {
        const dc = pc.createDataChannel("chat");
        setupDataChannel(dc);
      }
      pc.ondatachannel = (e) => setupDataChannel(e.channel);

      return pc;
    },
    [setupDataChannel, sendSignal]
  );

  // --- Connect to peer using DB-based signaling ---
  const connectToPeer = useCallback(
    async (stream: MediaStream, partnerId: string, iAmOfferer: boolean) => {
      if (roomRef.current) return;
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }

      const roomId = [myIdRef.current, partnerId].sort().join("-");
      roomRef.current = roomId;
      setStatus("connecting");
      console.log("[meetrr] room:", roomId, "offerer:", iAmOfferer);

      const pc = createPeerConnection(stream, roomId, iAmOfferer);
      const pendingIce: RTCIceCandidateInit[] = [];
      const processedSignalIds = new Set<string>();

      const addOrQueueIce = async (candidate?: RTCIceCandidateInit) => {
        if (!candidate) return;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          return;
        }
        pendingIce.push(candidate);
      };

      const flushPendingIce = async () => {
        if (!pc.remoteDescription || pendingIce.length === 0) return;
        for (const candidate of pendingIce.splice(0)) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      };

      const handleSignal = async (signal: DbSignal) => {
        if (!signal?.id) return;
        if (signal.sender_id === myIdRef.current) return;
        if (processedSignalIds.has(signal.id)) return;
        processedSignalIds.add(signal.id);

        console.log("[meetrr] received signal:", signal.type);

        if (signal.type === "offer" && !iAmOfferer) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp));
          await flushPendingIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(roomId, "answer", { sdp: answer });
          return;
        }

        if (signal.type === "answer" && iAmOfferer) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp));
          await flushPendingIce();
          return;
        }

        if (signal.type === "ice-candidate") {
          await addOrQueueIce(signal.payload.candidate);
        }
      };

      // Listen for signals via Postgres realtime
      const channel = supabase
        .channel(`signals-${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "signals",
            filter: `room_id=eq.${roomId}`,
          },
          async (payload) => {
            const signal = payload.new as DbSignal;
            try {
              await handleSignal(signal);
            } catch (e) {
              console.error("[meetrr] signal handling error:", e);
            }
          }
        )
        .subscribe((subStatus) => {
          console.log("[meetrr] realtime subscribe status:", subStatus);
        });

      realtimeChannelRef.current = channel;

      // Poll DB for signals as a reliable fallback (realtime may miss events)
      const signalPoll = setInterval(async () => {
        if (cleanedUpRef.current || pc.connectionState === "connected") {
          clearInterval(signalPoll);
          return;
        }
        
        const { data } = await supabase
          .from("signals")
          .select("*")
          .eq("room_id", roomId)
          .neq("sender_id", myIdRef.current)
          .order("created_at", { ascending: true });

        if (data && data.length > 0) {
          console.log("[meetrr] DB poll found", data.length, "signals");
          for (const signal of data as DbSignal[]) {
            try {
              await handleSignal(signal);
            } catch (e) {
              console.warn("[meetrr] signal poll error:", e);
            }
          }
        }
      }, 2000);

      // Remove self from waiting queue once we move to a room.
      await supabase.from("waiting_users").delete().eq("user_id", myIdRef.current);

      // Offerer: send offer quickly.
      if (iAmOfferer) {
        console.log("[meetrr] creating offer...");
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(roomId, "offer", { sdp: offer });
        } catch (e) {
          console.error("[meetrr] offer error:", e);
        }
      }
    },
    [createPeerConnection, sendSignal]
  );

  // --- Start searching ---
  const startSearching = useCallback(async () => {
    if (searchInProgressRef.current) {
      return;
    }
    if (!isSupabaseConfigured) {
      setStatus("config_required");
      return;
    }
    searchInProgressRef.current = true;
    setStatus("searching");

    try {
      await cleanup();
    } catch (err) {
      // Do not block a new search if cleanup hits transient network issues.
      console.warn("[meetrr] cleanup before search failed, continuing:", err);
    }
    cleanedUpRef.current = false;
    myIdRef.current = generateClientId();

    let stream: MediaStream;
    try {
      stream = await getLocalStream();
    } catch (err) {
      console.warn("[meetrr] startSearching blocked: camera required", err);
      searchInProgressRef.current = false;
      setStatus("camera_required");
      return;
    }
    const myId = myIdRef.current;

    console.log("[meetrr] searching as:", myId);

    const { error: insertError } = await supabase.from("waiting_users").upsert({ user_id: myId });
    if (insertError) {
      console.error("[meetrr] insert error:", insertError);
      searchInProgressRef.current = false;
      return;
    }
    console.log("[meetrr] inserted into waiting_users");

    const checkInvite = async () => {
      if (roomRef.current || cleanedUpRef.current) return false;

      const { data: invites, error: inviteError } = await supabase
        .from("signals")
        .select("id, sender_id")
        .eq("room_id", `invite-${myId}`)
        .neq("sender_id", myId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (inviteError) {
        console.warn("[meetrr] invite poll error:", inviteError);
        return false;
      }

      if (!invites || invites.length === 0) {
        return false;
      }

      const invite = invites[0] as { id: string; sender_id: string };
      const partnerId = invite.sender_id;

      // Best-effort cleanup of consumed invite.
      await supabase.from("signals").delete().eq("id", invite.id);

      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }

      const iAmOfferer = myId > partnerId;
      // Best-effort queue cleanup once a match is accepted.
      await supabase.from("waiting_users").delete().eq("user_id", partnerId);
      await connectToPeer(stream, partnerId, iAmOfferer);
      searchInProgressRef.current = false;
      return true;
    };

    const tryMatch = async () => {
      if (cleanedUpRef.current) return;
      if (await checkInvite()) return;

      const { data, error } = await supabase
        .from("waiting_users")
        .select("user_id")
        .neq("user_id", myId)
        // Prefer newest waiters to avoid repeatedly selecting abandoned stale rows.
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.warn("[meetrr] poll error:", error);
        return;
      }

      console.log("[meetrr] poll: found", data?.length ?? 0, "others");

      if (data && data.length > 0) {
        const partnerId = data[0].user_id;
        if (partnerId === myId) {
          return;
        }
        console.log("[meetrr] matched:", partnerId);

        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        // Nudge partner to connect immediately (faster than waiting for next poll).
        await sendSignal(`invite-${partnerId}`, "invite", { partner_id: myId });

        const iAmOfferer = myId > partnerId;
        // Best-effort queue cleanup once we decide on a partner.
        await supabase.from("waiting_users").delete().eq("user_id", partnerId);
        await connectToPeer(stream, partnerId, iAmOfferer);
        searchInProgressRef.current = false;
      }
    };

    // Listen for direct invites while searching.
    const inviteChannel = supabase
      .channel(`invite-${myId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signals",
          filter: `room_id=eq.invite-${myId}`,
        },
        async (payload) => {
          if (roomRef.current || cleanedUpRef.current) return;
          const invite = payload.new as DbSignal;
          if (invite.sender_id === myId) return;

          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          const partnerId = invite.sender_id;
          const iAmOfferer = myId > partnerId;
          await connectToPeer(stream, partnerId, iAmOfferer);
          searchInProgressRef.current = false;
        }
      )
      .subscribe();

    realtimeChannelRef.current = inviteChannel;

    await checkInvite();
    await tryMatch();
    if (!roomRef.current && !cleanedUpRef.current) {
      pollingRef.current = setInterval(tryMatch, 1000);
    }
  }, [cleanup, getLocalStream, connectToPeer, sendSignal]);

  // --- Send chat message ---
  const sendMessage = useCallback((text: string) => {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(text);
      setMessages((prev) => [...prev, { text, from: "me" }]);
    }
  }, []);

  const disconnect = useCallback(() => {
    cleanup();
    searchInProgressRef.current = false;
    setStatus("idle");
  }, [cleanup]);

  const skip = useCallback(() => {
    searchInProgressRef.current = false;
    cleanup().then(() => startSearching());
  }, [cleanup, startSearching]);

  // Only cleanup on unmount
  useEffect(() => {
    return () => {
      cleanedUpRef.current = true;
      searchInProgressRef.current = false;
      pcRef.current?.close();
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
    };
  }, []);

  return {
    status,
    localStream,
    remoteStream,
    messages,
    startSearching,
    sendMessage,
    disconnect,
    skip,
    getLocalStream,
  };
}
