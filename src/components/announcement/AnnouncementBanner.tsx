import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, Megaphone, X } from 'lucide-react';
import { AnnouncementBannerInfo } from '../../types';

interface AnnouncementBannerProps {
  announcement: AnnouncementBannerInfo | null;
  isDismissed: boolean;
  onDismiss: () => void;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({
  announcement,
  isDismissed,
  onDismiss,
}) => {
  if (!announcement || !announcement.enabled || !announcement.message.trim() || isDismissed) {
    return null;
  }

  const type = announcement.type || 'info';

  const getStyleConfig = () => {
    switch (type) {
      case 'warning':
        return {
          icon: <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />,
          badgeBg: 'rgba(245, 158, 11, 0.14)',
          badgeColor: '#f59e0b',
          badgeBorder: 'rgba(245, 158, 11, 0.28)',
          badgeText: 'Pemberitahuan Sistem',
          borderColor: 'rgba(245, 158, 11, 0.22)',
          highlightGlow: 'rgba(245, 158, 11, 0.05)',
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 shrink-0" />,
          badgeBg: 'rgba(16, 185, 129, 0.14)',
          badgeColor: '#10b981',
          badgeBorder: 'rgba(16, 185, 129, 0.28)',
          badgeText: 'Pembaruan Layanan',
          borderColor: 'rgba(16, 185, 129, 0.22)',
          highlightGlow: 'rgba(16, 185, 129, 0.05)',
        };
      case 'info':
      default:
        return {
          icon: <Megaphone className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" style={{ color: 'var(--accent)' }} />,
          badgeBg: 'var(--accent-soft)',
          badgeColor: 'var(--accent)',
          badgeBorder: 'var(--accent-soft-hover)',
          badgeText: 'Pengumuman Resmi',
          borderColor: 'var(--border-subtle)',
          highlightGlow: 'var(--accent-soft)',
        };
    }
  };

  const style = getStyleConfig();

  return (
    <AnimatePresence>
      <motion.aside
        id="announcement-banner"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full mb-6 rounded-2xl relative overflow-hidden backdrop-blur-md transition-all duration-300"
        style={{
          backgroundColor: 'var(--surface-primary)',
          border: `1px solid ${style.borderColor}`,
          boxShadow: 'var(--shadow-subtle)',
        }}
        role="region"
        aria-label="Pengumuman Sistem"
      >
        {/* Subtle accent top line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-75"
          style={{
            background: `linear-gradient(90deg, transparent, ${style.badgeColor}, transparent)`,
          }}
        />

        <div className="p-3.5 sm:p-4 flex items-start justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Icon Avatar */}
            <div
              className="p-2 sm:p-2.5 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{
                backgroundColor: style.badgeBg,
                border: `1px solid ${style.badgeBorder}`,
              }}
            >
              {style.icon}
            </div>

            {/* Message Body */}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full inline-flex items-center"
                  style={{
                    backgroundColor: style.badgeBg,
                    color: style.badgeColor,
                    border: `1px solid ${style.badgeBorder}`,
                  }}
                >
                  {style.badgeText}
                </span>
                <span className="text-[10px] font-semibold opacity-50" style={{ color: 'var(--text-muted)' }}>
                  Realtime Broadcast
                </span>
              </div>

              <p
                className="text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-line break-words"
                style={{ color: 'var(--text-main)' }}
              >
                {announcement.message}
              </p>
            </div>
          </div>

          {/* Dismiss Button */}
          <button
            type="button"
            id="btn-dismiss-announcement"
            onClick={onDismiss}
            className="p-1.5 sm:p-2 rounded-xl text-muted-foreground hover:text-foreground transition-all duration-200 shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40 mt-0.5 active:scale-95"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
            title="Tutup pengumuman"
            aria-label="Tutup pengumuman"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
};
