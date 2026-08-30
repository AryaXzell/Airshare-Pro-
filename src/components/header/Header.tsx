import React from 'react';
import { Share2 } from 'lucide-react';
import { ThemeSelector } from './ThemeSelector';
import { ThemeName } from '../../types';

interface HeaderProps {
  currentTheme: ThemeName;
  onSelectTheme: (theme: ThemeName) => void;
  mediaCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTheme,
  onSelectTheme,
  mediaCount,
}) => {
  return (
    <div className="w-full flex justify-center pt-4 px-4 sticky top-0 z-40 pointer-events-none">
      <header
        className="w-full max-w-2xl clean-surface-elevated rounded-full px-5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between pointer-events-auto transition-all"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-subtle)',
        }}
      >
        <div className="flex items-center space-x-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-xs"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Share2 className="w-4 h-4 stroke-[2.4]" style={{ color: 'var(--accent-text)' }} />
          </div>
          <div className="flex items-baseline space-x-1.5">
            <h1 className="font-extrabold tracking-tight text-base sm:text-lg" style={{ color: 'var(--text-main)' }}>
              AirShare
            </h1>
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
              style={{
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              PRO
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          {mediaCount > 0 && (
            <div
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{mediaCount} media</span>
            </div>
          )}

          <ThemeSelector currentTheme={currentTheme} onSelectTheme={onSelectTheme} />
        </div>
      </header>
    </div>
  );
};
