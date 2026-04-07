import { useEffect, useRef, useState } from 'react';
import {
  Film,
  Maximize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { StageItem } from '@/types/dashboard';

export type PreviewPlaybackState = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
};

export type PreviewPlaybackRequest =
  | { type: 'play'; token: number }
  | { type: 'pause'; token: number }
  | { type: 'seek'; token: number; time: number };

type PreviewPanelProps = {
  selectedItem?: StageItem;
  playbackRequest?: PreviewPlaybackRequest | null;
  onPlaybackStateChange?: (state: PreviewPlaybackState) => void;
};

export function PreviewPanel({
  selectedItem,
  playbackRequest,
  onPlaybackStateChange,
}: PreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const hasVideo = Boolean(selectedItem?.videoUrl);
  const selectedItemName = selectedItem?.name ?? 'No video selected';

  const formatTime = (seconds: number) => {
    const rounded = Number(seconds.toFixed(2));
    const mins = Math.floor(rounded / 60);
    const secondsPart = rounded - mins * 60;
    const secs = Math.floor(secondsPart);
    const hundredths = Math.round((secondsPart - secs) * 100);

    if (hundredths === 100) {
      return formatTime(mins * 60 + secs + 1);
    }

    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!videoRef.current || !hasVideo) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      void videoRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(current);
    setProgress(dur ? (current / dur) * 100 : 0);
  };

  useEffect(() => {
    if (!isPlaying || !videoRef.current) {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const syncPlayback = () => {
      if (!videoRef.current) {
        return;
      }

      const current = videoRef.current.currentTime;
      const dur = videoRef.current.duration || 0;
      setCurrentTime(current);
      setProgress(dur ? (current / dur) * 100 : 0);
      animationFrameRef.current = window.requestAnimationFrame(syncPlayback);
    };

    animationFrameRef.current = window.requestAnimationFrame(syncPlayback);

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !videoRef.current || !duration || isPlaying) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    videoRef.current.currentTime = pct * duration;
    setProgress(pct * 100);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted((value) => !value);
  };

  const lastRequestTokenRef = useRef<number | null>(null);

  useEffect(() => {
    onPlaybackStateChange?.({
      currentTime,
      duration,
      isPlaying,
    });
  }, [currentTime, duration, isPlaying, onPlaybackStateChange]);

  useEffect(() => {
    if (!videoRef.current || !playbackRequest || !hasVideo) {
      return;
    }

    if (lastRequestTokenRef.current === playbackRequest.token) {
      return;
    }

    lastRequestTokenRef.current = playbackRequest.token;

    if (playbackRequest.type === 'play') {
      void videoRef.current.play();
      return;
    }

    if (playbackRequest.type === 'pause') {
      videoRef.current.pause();
      return;
    }

    videoRef.current.currentTime = Math.max(0, Math.min(playbackRequest.time, duration || 0));
    setCurrentTime(videoRef.current.currentTime);
    setProgress(duration ? (videoRef.current.currentTime / duration) * 100 : 0);
  }, [duration, hasVideo, playbackRequest]);

  useEffect(() => {
    if (!hasVideo) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setProgress(0);
    }
  }, [hasVideo, selectedItem?.id]);

  return (
    <div
      className="relative min-h-[300px] overflow-hidden bg-[#0a0a0a] md:min-h-[360px] lg:h-[62%] lg:min-h-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={selectedItem?.videoUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {!hasVideo ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-20 w-20 rounded-full border border-white/5 animate-ping md:h-24 md:w-24" />
            <div className="absolute h-14 w-14 rounded-full border border-white/5 md:h-16 md:w-16" />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur md:h-14 md:w-14">
              <Film className="h-5 w-5 text-white/20 md:h-6 md:w-6" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-white/30 uppercase md:text-[12px]">
              No video selected
            </p>
            <p className="text-[10px] text-white/15">
              Select a stage from the list to play
            </p>
          </div>
        </div>
      ) : null}

      <div className="absolute inset-0 cursor-pointer" onClick={togglePlay} />

      <div
        className={cn(
          'absolute left-0 right-0 top-0 bg-linear-to-b from-black/60 to-transparent px-3 pt-3 pb-5 transition-all duration-300 md:px-4 md:pb-6',
          isHovered || !isPlaying ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="truncate text-xs font-medium text-white/70">
            {selectedItemName}
          </span>
        </div>
      </div>

      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 via-black/30 to-transparent px-3 pb-3 pt-8 transition-all duration-300 md:px-4 md:pb-4 md:pt-10',
          isHovered || !isPlaying
            ? 'translate-y-0 opacity-100'
            : 'translate-y-1 opacity-0'
        )}
      >
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className={cn(
            'group relative mb-3 h-1 w-full rounded-full bg-white/20 transition-all duration-150',
            isPlaying ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:h-1.5',
          )}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-white/20"
            style={{ width: '60%' }}
          />
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-linear-to-r from-blue-400 to-violet-400"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-md group-hover:opacity-100"
            style={{ left: `${progress}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={togglePlay}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-all hover:scale-105 hover:bg-white/25 active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="ml-0.5 h-3.5 w-3.5" />
              )}
            </button>

            <button
              onClick={toggleMute}
              className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/15 hover:text-white"
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </button>

            <div className="flex items-center gap-1 font-mono text-[11px] md:text-xs">
              <span className="font-semibold text-white">
                {formatTime(currentTime)}
              </span>
              <span className="text-white/30">/</span>
              <span className="text-white/50">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => videoRef.current?.requestFullscreen()}
              className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/15 hover:text-white"
            >
              <Maximize className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {!isPlaying && hasVideo ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur">
            <Play className="ml-1 h-6 w-6 text-white" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
