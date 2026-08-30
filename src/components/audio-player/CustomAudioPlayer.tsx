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

  const coverImage = item.audioMeta?.coverUrl || DEFAULT_AUDIO_COVER;
  const songTitle =
    item.audioMeta?.title || item.name.replace(/\.[^/.]+$/, '');
  const songArtist = item.audioMeta?.artist || 'Artis Tidak Dikenal';

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

  const handleRewind = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
  };

  const handleForward = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10);
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
  }, [togglePlay]);

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
              className="w-16 h-1 rounded-full cursor-pointer accent-white"
            />
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 py-1.5 px-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition-all clean-tap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Disalin' : 'Salin'}</span>
            </button>

            <a
              href={item.blobUrl || item.shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={item.name}
              className="flex items-center space-x-1.5 py-1.5 px-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition-all clean-tap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
