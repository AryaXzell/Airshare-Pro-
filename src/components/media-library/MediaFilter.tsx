import React from 'react';
import { Search, Image, Video, Music, Layers, X } from 'lucide-react';
import { MediaType } from '../../types';

interface MediaFilterProps {
  currentFilter: 'all' | MediaType;
  onFilterChange: (filter: 'all' | MediaType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalCount: number;
}

export const MediaFilter: React.FC<MediaFilterProps> = ({
  currentFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
}) => {
  const tabs: { id: 'all' | MediaType; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Semua', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'image', label: 'Foto', icon: <Image className="w-3.5 h-3.5" /> },
    { id: 'video', label: 'Video', icon: <Video className="w-3.5 h-3.5" /> },
    { id: 'audio', label: 'Audio', icon: <Music className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-3 mb-4">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nama berkas, judul lagu, atau artis..."
          className="w-full rounded-2xl py-2.5 pl-10 pr-9 text-xs sm:text-sm clean-input font-medium"
        />
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="p-1 rounded-full clean-interactive absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Hapus pencarian"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar">
        {tabs.map((tab) => {
          const isActive = currentFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onFilterChange(tab.id)}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-150 clean-tap flex-shrink-0 border ${
                isActive
                  ? 'shadow-xs'
                  : 'clean-interactive opacity-75 hover:opacity-100'
              }`}
              style={{
                backgroundColor: isActive ? 'var(--accent)' : 'var(--surface-secondary)',
                color: isActive ? 'var(--accent-text)' : 'var(--text-main)',
                borderColor: isActive ? 'transparent' : 'var(--border-subtle)',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
