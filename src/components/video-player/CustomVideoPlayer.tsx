import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  PictureInPicture2,
  ChevronLeft,
} from 'lucide-react';
import { AppleSlider } from '../ui/AppleSlider';
import { MediaItem } from '../../types';
import { formatDuration } from '../../lib/utils';

interface CustomVideoPlayerProps {
  item: MediaItem;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  item,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekFeedback, setSeekFeedback] = useState<{ text: string; side: 'left' | 'right' } | null>(null);

  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' }>({ time: 0, side: 'left' });

  const videoTitle = item.name.replace(/\.[^/.]+$/, '');

  // Auto-hide controls
  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);

    if (videoRef.current && !videoRef.current.paused) {
      hideControlsTimer.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2800);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(console.warn);
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const handleRewind = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 15);
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  const handleForward = useCallback(() => {
    if (!videoRef.current) return;
    const dur = isFinite(videoRef.current.duration) ? videoRef.current.duration : duration;
    videoRef.current.currentTime = Math.min(dur || 999999, videoRef.current.currentTime + 15);
    showControlsTemporarily();
  }, [duration, showControlsTemporarily]);

  // MediaSession API Integration
  useEffect(() => {
    if ('mediaSession' in navigator && typeof window.MediaMetadata !== 'undefined') {
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: videoTitle,
          artist: 'AirShare Pro Video',
          album: 'AirShare Pro',
        });

        navigator.mediaSession.setActionHandler('play', () => {
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(console.warn);
            setIsPlaying(true);
          }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
            setIsPlaying(false);
          }
        });

        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          if (!videoRef.current) return;
          const seekOffset = details.seekOffset || 15;
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - seekOffset);
        });

        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          if (!videoRef.current) return;
          const seekOffset = details.seekOffset || 15;
          const dur = isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
          videoRef.current.currentTime = Math.min(dur || 999999, videoRef.current.currentTime + seekOffset);
        });

        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (videoRef.current && details.seekTime !== undefined) {
            videoRef.current.currentTime = details.seekTime;
            setCurrentTime(details.seekTime);
          }
        });
      } catch (err) {
        console.warn('Video MediaSession initialization error:', err);
      }
    }

    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = null;
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('seekbackward', null);
          navigator.mediaSession.setActionHandler('seekforward', null);
          navigator.mediaSession.setActionHandler('seekto', null);
        } catch {
          // Ignore
        }
      }
    };
  }, [videoTitle]);

  // Sync playbackState and positionState
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

      if (
        'setPositionState' in navigator.mediaSession &&
        duration > 0 &&
        isFinite(duration) &&
        isFinite(currentTime) &&
        currentTime <= duration
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration: duration,
            playbackRate: videoRef.current?.playbackRate || 1,
            position: Math.max(0, currentTime),
          });
        } catch {
          // Ignore
        }
      }
    }
  }, [isPlaying, currentTime, duration]);

  // Cleanup video buffers and timers on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
    };
  }, []);

  // Handle double tap seek
  const handleTap = (side: 'left' | 'right') => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current.time < 320 && lastTapRef.current.side === side;

    if (isDoubleTap) {
      if (!videoRef.current) return;
      const delta = side === 'left' ? -10 : 10;
      videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + delta));
      setSeekFeedback({
        text: side === 'left' ? '↩ 10s' : '10s ↪',
        side,
      });
      setTimeout(() => setSeekFeedback(null), 800);
    } else {
      togglePlay();
    }

    lastTapRef.current = { time: now, side };
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(
    item.videoMeta?.width && item.videoMeta?.height
      ? { width: item.videoMeta.width, height: item.videoMeta.height }
      : null
  );

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    if (isFinite(dur)) setDuration(dur);

    const vWidth = videoRef.current.videoWidth;
    const vHeight = videoRef.current.videoHeight;
    if (vWidth && vHeight) {
      setVideoDimensions({ width: vWidth, height: vHeight });
    }
  };

  const handleSeek = (percentage: number) => {
    if (!videoRef.current || duration <= 0) return;
    const newTime = (percentage / 100) * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    showControlsTemporarily();
  };

  const handlePip = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  // Keyboard navigation inside player
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleRewind();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleForward();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleRewind, handleForward]);

  const sliderPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remainingSeconds = Math.max(0, duration - currentTime);

  const ratio = videoDimensions
    ? videoDimensions.width / videoDimensions.height
    : 16 / 9;

  const isPortrait = ratio < 0.85;
  const isSquare = ratio >= 0.85 && ratio <= 1.2;

  const containerMaxWidthClass = isPortrait
    ? 'max-w-[340px] sm:max-w-[380px]'
    : isSquare
    ? 'max-w-[460px] sm:max-w-[520px]'
    : ratio > 1.9
    ? 'max-w-4xl sm:max-w-5xl'
    : 'max-w-3xl sm:max-w-4xl';

  return (
    <div
      ref={containerRef}
      onMouseMove={showControlsTemporarily}
      onTouchStart={showControlsTemporarily}
      className={`w-full ${containerMaxWidthClass} mx-auto bg-transparent rounded-[2rem] sm:rounded-[2.4rem] overflow-hidden relative select-none flex flex-col justify-center transition-all duration-200`}
    >
      <div
        className="relative w-full bg-transparent flex items-center justify-center overflow-hidden"
        style={{
          aspectRatio: videoDimensions
            ? `${videoDimensions.width} / ${videoDimensions.height}`
            : '16 / 9',
          maxHeight: 'min(78vh, 800px)',
          minHeight: isPortrait ? '360px' : '220px',
        }}
      >
        <video
          ref={videoRef}
          src={item.blobUrl || item.shareUrl}
          playsInline
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className="w-full h-full object-contain"
        />

        {/* Double-tap seek overlays */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            handleTap('left');
          }}
          className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-pointer"
        />
        <div
          onClick={(e) => {
            e.stopPropagation();
            handleTap('right');
          }}
          className="absolute inset-y-0 right-0 w-1/3 z-10 cursor-pointer"
        />

        {/* Double-tap feedback bubble */}
        {seekFeedback && (
          <div
            className={`absolute z-30 bg-black/85 text-white text-xs font-extrabold px-4 py-2 rounded-full shadow-lg pointer-events-none ${
              seekFeedback.side === 'left' ? 'left-1/4' : 'right-1/4'
            }`}
          >
            {seekFeedback.text}
          </div>
        )}

        {/* Controls Overlay */}
        <div
          className={`absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-5 transition-opacity duration-200 pointer-events-auto ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.85) 100%)',
          }}
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between w-full">
            <button
              onClick={onClose}
              className="text-xs font-bold px-3.5 py-2 rounded-full flex items-center space-x-1.5 text-white clean-tap border border-white/15"
              style={{ background: 'rgba(255, 255, 255, 0.15)' }}
              aria-label="Tutup pemutar video"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Selesai</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                onClick={handlePip}
                className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors clean-tap border border-white/10"
                title="Picture-in-Picture"
                aria-label="Mode Picture-in-Picture"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center Play/Pause Controls */}
          <div className="flex items-center justify-center space-x-6 sm:space-x-8">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRewind();
              }}
              className="p-2.5 sm:p-3 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors clean-tap border border-white/10"
              title="Mundur 15 detik"
              aria-label="Mundur 15 detik"
            >
              <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform duration-100 shadow-xl flex items-center justify-center"
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-black" />
              ) : (
                <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-black translate-x-0.5" />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleForward();
              }}
              className="p-2.5 sm:p-3 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors clean-tap border border-white/10"
              title="Maju 15 detik"
              aria-label="Maju 15 detik"
            >
              <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Bottom Timeline & Time Info */}
          <div className="w-full space-y-2">
            <div className="w-full">
              <AppleSlider
                ariaLabel="Posisi Waktu Video"
                value={sliderPercent}
                onChange={handleSeek}
                onChangeEnd={handleSeek}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-white/90">
              <span className="font-mono text-[11px] font-bold text-white/75 tabular-nums">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </span>

              <span className="text-[10px] font-bold font-mono text-white/50">
                -{formatDuration(remainingSeconds)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
