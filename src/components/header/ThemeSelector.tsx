import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Check } from 'lucide-react';
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 rounded-full clean-interactive flex items-center justify-center clean-tap"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: isOpen ? 'var(--surface-active)' : 'var(--surface-secondary)',
        }}
        aria-label="Ubah tema tampilan"
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Ubah Tema Tampilan"
      >
        <Palette className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: 'var(--accent)' }} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-12 w-64 rounded-3xl p-3 clean-floating-menu z-[60]"
            style={{
              borderColor: 'var(--border-subtle)',
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-wider mb-2 px-3 pt-1 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              Nuansa Tema Tampilan
            </p>

            <div className="space-y-1">
              {THEMES.map((theme) => {
                const isActive = currentTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => {
                      onSelectTheme(theme.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all clean-tap ${
                      isActive ? 'font-bold' : 'opacity-85 hover:opacity-100'
                    }`}
                    style={{
                      color: 'var(--text-main)',
                      backgroundColor: isActive ? 'var(--surface-hover)' : 'transparent',
                      border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    }}
                  >
                    <span className="flex items-center space-x-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-black/15 shadow-xs"
                        style={{ backgroundColor: theme.swatch }}
                      />
                      <span>{theme.name}</span>
                    </span>
                    {isActive && (
                      <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    )}
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
