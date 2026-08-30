import React from 'react';
import {
  Search,
  Image,
  Video,
  Music,
  Layers,
  X,
  ArrowUpDown,
  LayoutGrid,
  List,
} from 'lucide-react';
import { MediaType, SortOption, ViewMode } from '../../types';

interface MediaFilterProps {
  currentFilter: 'all' | MediaType;
  onFilterChange: (filter: 'all' | MediaType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  totalCount: number;
}

export const MediaFilter: React.FC<MediaFilterProps> = ({
  currentFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
}) => {
  const tabs: { id: 'all' | MediaType; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'Semua', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'image', label: 'Foto', icon: <Image className="w-3.5 h-3.5" /> },
    { id: 'video', label: 'Video', icon: <Video className="w-3.5 h-3.5" /> },
    { id: 'audio', label: 'Audio', icon: <Music className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-3 mb-4">
      {/* Search Input & View Toggle */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-grow">
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

        {/* View Mode Toggle */}
        <div
          className="flex items-center p-1 rounded-2xl border flex-shrink-0"
          style={{
            backgroundColor: 'var(--surface-secondary)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-2 rounded-xl clean-tap transition-colors ${
              viewMode === 'list' ? 'bg-black/10 dark:bg-white/15 text-blue-500 shadow-xs' : 'opacity-50 hover:opacity-100'
            }`}
            title="Tampilan List"
            aria-label="Tampilan List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-2 rounded-xl clean-tap transition-colors ${
              viewMode === 'grid' ? 'bg-black/10 dark:bg-white/15 text-blue-500 shadow-xs' : 'opacity-50 hover:opacity-100'
            }`}
            title="Tampilan Grid"
            aria-label="Tampilan Grid"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs & Sort Dropdown */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 no-scrollbar">
        {/* Type Tabs */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {tabs.map((tab) => {
            const isActive = currentFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onFilterChange(tab.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150 clean-tap flex-shrink-0 border ${
                  isActive ? 'shadow-xs' : 'clean-interactive opacity-75 hover:opacity-100'
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

        {/* Sort Select */}
        <div className="relative flex-shrink-0">
          <div
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-xs font-bold"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-main)',
            }}
          >
            <ArrowUpDown className="w-3 h-3 opacity-60 flex-shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="bg-transparent text-xs font-bold cursor-pointer outline-none appearance-none pr-4"
              style={{ color: 'var(--text-main)' }}
              aria-label="Urutkan Media"
            >
              <option value="newest" className="text-black bg-white dark:bg-neutral-900 dark:text-white">Terbaru</option>
              <option value="oldest" className="text-black bg-white dark:bg-neutral-900 dark:text-white">Terlama</option>
              <option value="name_asc" className="text-black bg-white dark:bg-neutral-900 dark:text-white">Nama (A-Z)</option>
              <option value="name_desc" className="text-black bg-white dark:bg-neutral-900 dark:text-white">Nama (Z-A)</option>
              <option value="size_desc" className="text-black bg-white dark:bg-neutral-900 dark:text-white">Ukuran Terbesar</option>
              <option value="size_asc" className="text-black bg-white dark:bg-neutral-900 dark:text-white">Ukuran Terkecil</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
