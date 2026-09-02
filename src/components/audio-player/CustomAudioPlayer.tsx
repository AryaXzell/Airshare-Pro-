import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Download,
  Music,
  X,
} from 'lucide-react';
import { AppleSlider } from '../ui/AppleSlider';
import { AudioVisualizer } from './AudioVisualizer';
import { MediaItem } from '../../types';
import { DEFAULT_AUDIO_COVER } from '../../lib/constants';
import { copyToClipboard, formatDuration } from '../../lib/utils';
import { downloadMediaFile } from '../../lib/download-helper';

interface CustomAudioPlayerProps {
  item: MediaItem;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({
  item,
  onClose,
  onToast,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const coverImage = item.audioMeta?.coverUrl || DEFAULT_AUDIO_COVER;
  const songTitle =
    item.audioMeta?.title || item.name.replace(/\.[^/.]+$/, '');
  const songArtist = item.audioMeta?.artist || 'Artis Tidak Dikenal';
  const songAlbum = item.audioMeta?.album || 'AirShare Pro';

  // Toggle play/pause handler
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(console.warn);
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleRewind = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  }, []);

  const handleForward = useCallback(() => {
    if (!audioRef.current) return;
    const dur = isFinite(audioRef.current.duration) ? audioRef.current.duration : duration;
    audioRef.current.currentTime = Math.min(dur || 999999, audioRef.current.currentTime + 10);
  }, [duration]);

  // MediaSession API Integration (Lock Screen & Hardware Key Controls)
  useEffect(() => {
    if ('mediaSession' in navigator && typeof window.MediaMetadata !== 'undefined') {
      try {
        const coverWidth = item.audioMeta?.coverWidth;
        const coverHeight = item.audioMeta?.coverHeight;
        const isCustomCover = Boolean(item.audioMeta?.coverUrl);
        const hasExplicitDimensions =
          isCustomCover &&
          typeof coverWidth === 'number' &&
          typeof coverHeight === 'number' &&
          coverWidth > 0 &&
          coverHeight > 0;

        const artworkMime = coverImage.endsWith('.svg')
          ? 'image/svg+xml'
          : coverImage.endsWith('.png')
          ? 'image/png'
          : 'image/jpeg';

        const artwork = hasExplicitDimensions
          ? [
              {
                src: coverImage,
                sizes: `${coverWidth}x${coverHeight}`,
                type: artworkMime,
              },
            ]
          : [
              {
                src: coverImage,
                sizes: '96x96',
                type: artworkMime,
              },
              {
                src: coverImage,
                sizes: '192x192',
                type: artworkMime,
              },
              {
                src: coverImage,
                sizes: '512x512',
                type: artworkMime,
              },
            ];

        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: songTitle,
          artist: songArtist,
          album: songAlbum,
          artwork,
        });

        navigator.mediaSession.setActionHandler('play', () => {
          if (audioRef.current && audioRef.current.paused) {
            audioRef.current.play().catch(console.warn);
            setIsPlaying(true);
          }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
            setIsPlaying(false);
          }
        });

        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          if (!audioRef.current) return;
          const seekOffset = details.seekOffset || 10;
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - seekOffset);
        });

        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          if (!audioRef.current) return;
          const seekOffset = details.seekOffset || 10;
          const dur = isFinite(audioRef.current.duration) ? audioRef.current.duration : 0;
          audioRef.current.currentTime = Math.min(dur || 999999, audioRef.current.currentTime + seekOffset);
        });

        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (audioRef.current && details.seekTime !== undefined) {
            audioRef.current.currentTime = details.seekTime;
            setCurrentTime(details.seekTime);
          }
        });

        navigator.mediaSession.setActionHandler('stop', () => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
          }
        });
      } catch (err) {
        console.warn('MediaSession initialization error:', err);
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
          navigator.mediaSession.setActionHandler('stop', null);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [songTitle, songArtist, songAlbum, coverImage]);

  // Sync playbackState and positionState to navigator.mediaSession
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
            playbackRate: audioRef.current?.playbackRate || 1,
            position: Math.max(0, currentTime),
          });
        } catch {
          // Ignore positionState edge-case clamp errors
        }
      }
    }
  }, [isPlaying, currentTime, duration]);

  // Cleanup audio element on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
    };
  }, []);

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration;
    if (isFinite(dur)) setDuration(dur);
  };

  const handleSeek = (percentage: number) => {
    if (!audioRef.current || duration <= 0) return;
    const newTime = (percentage / 100) * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      audioRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioRef.current.muted = nextMuted;
    if (!nextMuted && volume === 0) {
      setVolume(0.5);
      audioRef.current.volume = 0.5;
    }
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(item.shareUrl);
    if (ok) {
      setCopied(true);
      onToast('Tautan audio disalin!');
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadMediaFile(item.blobUrl || item.shareUrl, item.name);
      onToast('Unduhan audio dimulai!');
    } catch {
      onToast('Gagal mengunduh audio. Membuka di tab baru...');
      window.open(item.shareUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

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
      } else if (e.key === 'm') {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleRewind, handleForward]);

  const sliderPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="relative w-full max-w-sm mx-auto rounded-[2.2rem] overflow-hidden text-white z-10 select-none border"
      style={{
        backgroundColor: '#16161a',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        boxShadow: 'var(--shadow-modal)',
      }}
    >
      <audio
        ref={audioRef}
        src={item.blobUrl || item.shareUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Main Container */}
      <div className="flex flex-col w-full p-5 sm:p-6 space-y-4">
        {/* Top Header */}
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/70 flex items-center space-x-1.5">
            <Music className="w-3.5 h-3.5 text-blue-400" />
            <span>Sedang Diputar</span>
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-all clean-tap"
            aria-label="Tutup pemutar audio"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Album Cover & Track Info Card */}
        <div
          className="flex items-center space-x-4 p-3.5 rounded-2xl border"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            className={`w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-white/10 transition-transform duration-300 ${
              isPlaying ? 'scale-105 shadow-md' : 'scale-100'
            }`}
          >
            <img
              src={coverImage}
              alt="Cover Art"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_AUDIO_COVER;
              }}
            />
          </div>

          <div className="overflow-hidden flex-grow min-w-0 text-left">
            <h3 className="font-extrabold text-sm sm:text-base tracking-tight leading-snug truncate">
              {songTitle}
            </h3>
            <p className="text-xs text-white/60 font-semibold truncate mt-0.5">
              {songArtist}
            </p>

            <AudioVisualizer isPlaying={isPlaying} />
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="w-full space-y-1.5 px-1 pt-1">
          <AppleSlider
            ariaLabel="Posisi Waktu Audio"
            value={sliderPercent}
            onChange={handleSeek}
            onChangeEnd={handleSeek}
          />
          <div className="flex justify-between text-[11px] font-bold text-white/50 tabular-nums">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-center space-x-8 py-1">
          <button
            onClick={handleRewind}
            className="p-2 text-white/70 hover:text-white transition-colors clean-tap"
            title="Mundur 10 detik"
            aria-label="Mundur 10 detik"
          >
            <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          <button
            onClick={togglePlay}
            className="w-13 h-13 sm:w-14 sm:h-14 bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-transform duration-100 shadow-lg flex items-center justify-center"
            aria-label={isPlaying ? 'Jeda' : 'Putar'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-black" />
            ) : (
              <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-black translate-x-0.5" />
            )}
          </button>

          <button
            onClick={handleForward}
            className="p-2 text-white/70 hover:text-white transition-colors clean-tap"
            title="Maju 10 detik"
            aria-label="Maju 10 detik"
          >
            <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Volume & Bottom Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs">
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleMute}
              className="text-white/70 hover:text-white transition-colors clean-tap"
              aria-label={isMuted || volume === 0 ? 'Bunyikan suara' : 'Bisukan suara'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Volume audio"
              className="w-16 h-1 rounded-full cursor-pointer accent-white"
            />
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 py-1.5 px-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition-all clean-tap"
              aria-label="Salin tautan audio"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Disalin' : 'Salin'}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center space-x-1.5 py-1.5 px-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition-all clean-tap disabled:opacity-50"
              aria-label="Unduh berkas audio"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloading ? 'Mengunduh...' : 'Unduh'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
