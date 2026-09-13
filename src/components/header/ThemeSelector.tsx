import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Sparkles } from 'lucide-react';
import { ThemeName } from '../../types';
import { THEMES } from '../../lib/constants';

interface ThemeSelectorProps {
  currentTheme: ThemeName;
  onSelectTheme: (theme: ThemeName) => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  onSelectTheme,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle outside clicks and keyboard escape (optimized with passive event listeners)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = useCallback((themeId: ThemeName) => {
    onSelectTheme(themeId);
    setIsOpen(false);
  }, [onSelectTheme]);

  return (
    <div className="relative" ref={containerRef} id="theme-selector-container">
      <button
        id="theme-selector-trigger"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-2 sm:p-2.5 rounded-full clean-interactive flex items-center justify-center clean-tap transition-transform active:scale-95 touch-manipulation"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: isOpen ? 'var(--surface-active)' : 'var(--surface-secondary)',
        }}
        aria-label="Pilih tema tampilan"
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Ubah Tema Tampilan"
      >
        <Palette className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: 'var(--accent)' }} />
      </button>

      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            id="theme-selector-dropdown"
            role="dialog"
            aria-label="Pilihan Tema Tampilan"
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -2 }}
            transition={{
              duration: 0.13,
              ease: [0.16, 1, 0.3, 1], // Apple-spec rapid deceleration curve
            }}
            style={{
              transformOrigin: 'top right',
              willChange: 'transform, opacity',
              transform: 'translate3d(0, 0, 0)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              backgroundColor: 'var(--surface-elevated)',
              borderColor: 'var(--border-subtle)',
              contain: 'layout paint',
            }}
            className="absolute right-0 top-11 sm:top-12 w-[min(16.5rem,calc(100vw-1.25rem))] rounded-2xl p-2 z-[60] shadow-xl max-h-[min(28rem,calc(100dvh-4.5rem))] overflow-y-auto overscroll-contain"
          >
            {/* Header: Title */}
            <div className="flex items-center px-2 py-1.5 mb-1 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <span className="text-[11.5px] font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
                  Tema Tampilan
                </span>
              </div>
            </div>

            {/* List of Theme Options */}
            <div className="space-y-1 py-0.5" role="radiogroup" aria-label="Daftar Tema">
              {THEMES.map((theme) => {
                const isActive = currentTheme === theme.id;

                return (
                  <button
                    key={theme.id}
                    id={`theme-option-${theme.id}`}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => handleSelect(theme.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors duration-100 clean-tap text-left touch-manipulation ${
                      isActive
                        ? 'font-bold shadow-2xs'
                        : 'font-normal hover:font-medium opacity-90 hover:opacity-100'
                    }`}
                    style={{
                      color: 'var(--text-main)',
                      backgroundColor: isActive
                        ? 'var(--surface-hover)'
                        : 'transparent',
                      border: isActive
                        ? '1px solid var(--accent)'
                        : '1px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Active Radio Dot */}
                      <div
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{
                          border: `1.5px solid ${isActive ? theme.colors.accent : 'var(--text-muted)'}`,
                          backgroundColor: isActive ? theme.colors.accent : 'transparent',
                        }}
                      >
                        {isActive && (
                          <div className="w-1 h-1 rounded-full bg-white" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[11.5px] sm:text-xs">{theme.name}</span>
                          <span
                            className="text-[8px] px-1 py-0.2 rounded font-medium uppercase tracking-wider flex-shrink-0"
                            style={{
                              backgroundColor: theme.isDark
                                ? 'rgba(255, 255, 255, 0.08)'
                                : 'rgba(0, 0, 0, 0.06)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {theme.isDark ? 'Dark' : 'Light'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Compact Segmented Color Swatch Strip */}
                    <div
                      className="flex items-center gap-1 p-0.5 px-1 rounded-md flex-shrink-0"
                      style={{
                        backgroundColor: 'var(--surface-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                      title="Palet: Latar | Kartu | Aksen | Teks"
                    >
                      {/* BG */}
                      <span
                        className="w-2 h-2 rounded-full border border-black/10 flex-shrink-0"
                        style={{ backgroundColor: theme.colors.bg }}
                      />
                      {/* Surface */}
                      <span
                        className="w-2 h-2 rounded-full border border-black/10 flex-shrink-0"
                        style={{ backgroundColor: theme.colors.surface }}
                      />
                      {/* Accent */}
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: theme.colors.accent }}
                      />
                      {/* Text */}
                      <span
                        className="w-2 h-2 rounded-full border border-white/20 flex-shrink-0"
                        style={{ backgroundColor: theme.colors.text }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
