import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Megaphone,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AnnouncementBannerInfo, MaintenanceLevel } from '../../types';

export interface AnnouncementBannerProps {
  maintenanceLevel?: MaintenanceLevel;
  announcement: AnnouncementBannerInfo | null;
  isDismissed: boolean;
  onDismiss: () => void;
}

interface BannerItem {
  id: string;
  isSystemAuto: boolean;
  priority: number;
  type: 'warning' | 'lockdown' | 'info' | 'success';
  badgeCategory: string;
  badgeSubText: string;
  headline: string;
  shortMessage: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  dismissible: boolean;
  onDismiss?: () => void;
  accentColor: string;
  borderColor: string;
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
  highlightGlow: string;
  icon: React.ReactNode;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({
  maintenanceLevel = 'off',
  announcement,
  isDismissed,
  onDismiss,
}) => {
  // Active front banner index (0 or 1 for iOS card swap)
  const [frontIndex, setFrontIndex] = useState<number>(0);
  const [expandedTextIds, setExpandedTextIds] = useState<Record<string, boolean>>({});

  const toggleTextExpand = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedTextIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 1. Build Automatic System Status Banner based on current Kill Switch / Maintenance state
  const isUploadDisabled = maintenanceLevel === 'upload_only';
  const isFullLockdown = maintenanceLevel === 'full_lockdown';
  const hasSystemAutoBanner = isUploadDisabled || isFullLockdown;

  const systemAutoBanner: BannerItem | null = hasSystemAutoBanner
    ? isFullLockdown
      ? {
          id: 'system-auto-lockdown',
          isSystemAuto: true,
          priority: 1, // Highest priority
          type: 'lockdown',
          badgeCategory: 'Darurat',
          badgeSubText: 'Lockdown',
          headline: 'Website Dalam Mode Pemeliharaan Total',
          shortMessage: 'Akses unggah dan unduh berkas ditutup sementara untuk pemeliharaan sistem.',
          message:
            'Seluruh aktivitas pengunggahan berkas dan pembagian tautan publik ditutup sementara oleh administrator untuk pemeliharaan darurat sistem. Akses akan dibuka kembali segera setelah pemeliharaan selesai.',
          actionUrl: '/status',
          actionLabel: 'Status Server',
          dismissible: false,
          accentColor: '#ef4444',
          borderColor: 'rgba(239, 68, 68, 0.4)',
          badgeBg: 'rgba(239, 68, 68, 0.14)',
          badgeColor: '#dc2626',
          badgeBorder: 'rgba(239, 68, 68, 0.28)',
          highlightGlow: 'rgba(239, 68, 68, 0.08)',
          icon: <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 shrink-0 animate-pulse" />,
        }
      : {
          id: 'system-auto-upload-off',
          isSystemAuto: true,
          priority: 1, // Highest priority
          type: 'warning',
          badgeCategory: 'Pemeliharaan',
          badgeSubText: 'Upload Ditutup',
          headline: 'Unggah Berkas Ditutup Sementara',
          shortMessage: 'Upload dinonaktifkan sementara untuk perbaikan. Fitur unduh & berkas tetap normal.',
          message:
            'Fitur unggah berkas baru dinonaktifkan sementara oleh administrator untuk pemeliharaan gateway penyimpanan. Tautan unduhan dan berkas yang sudah ada tetap dapat diakses secara normal tanpa gangguan.',
          actionUrl: '/status',
          actionLabel: 'Status Server',
          dismissible: false,
          accentColor: '#f59e0b',
          borderColor: 'rgba(245, 158, 11, 0.35)',
          badgeBg: 'rgba(245, 158, 11, 0.14)',
          badgeColor: '#d97706',
          badgeBorder: 'rgba(245, 158, 11, 0.28)',
          highlightGlow: 'rgba(245, 158, 11, 0.08)',
          icon: <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 shrink-0" />,
        }
    : null;

  // 2. Build Custom Admin Announcement Banner (if configured, enabled, and not dismissed)
  const hasCustomAnnouncement = Boolean(
    announcement && announcement.enabled && announcement.message && announcement.message.trim() && !isDismissed
  );

  let customBanner: BannerItem | null = null;
  if (hasCustomAnnouncement && announcement) {
    const annType = announcement.type || 'info';
    let badgeBg = 'var(--accent-soft)';
    let badgeColor = 'var(--accent)';
    let badgeBorder = 'var(--accent-soft-hover)';
    let badgeCategory = 'Pengumuman';
    let borderColor = 'var(--border-subtle)';
    let highlightGlow = 'var(--accent-soft)';
    let accentColor = 'var(--accent)';
    let icon: React.ReactNode = (
      <Megaphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={{ color: 'var(--accent)' }} />
    );

    if (annType === 'warning') {
      badgeBg = 'rgba(245, 158, 11, 0.14)';
      badgeColor = '#d97706';
      badgeBorder = 'rgba(245, 158, 11, 0.28)';
      badgeCategory = 'Pemberitahuan';
      borderColor = 'rgba(245, 158, 11, 0.22)';
      highlightGlow = 'rgba(245, 158, 11, 0.05)';
      accentColor = '#f59e0b';
      icon = <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 shrink-0" />;
    } else if (annType === 'success') {
      badgeBg = 'rgba(16, 185, 129, 0.14)';
      badgeColor = '#059669';
      badgeBorder = 'rgba(16, 185, 129, 0.28)';
      badgeCategory = 'Pembaruan';
      borderColor = 'rgba(16, 185, 129, 0.22)';
      highlightGlow = 'rgba(16, 185, 129, 0.05)';
      accentColor = '#10b981';
      icon = <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 shrink-0" />;
    }

    const rawMsg = announcement.message.trim();
    // Generate clean concise shortMessage if text is lengthy
    const customShort = rawMsg.length > 70 ? rawMsg.slice(0, 68).trim() + '...' : rawMsg;

    customBanner = {
      id: 'custom-admin-announcement',
      isSystemAuto: false,
      priority: 2, // Secondary priority under system auto banner
      type: annType as any,
      badgeCategory,
      badgeSubText: 'Admin',
      headline: '',
      shortMessage: customShort,
      message: rawMsg,
      dismissible: true,
      onDismiss,
      accentColor,
      borderColor,
      badgeBg,
      badgeColor,
      badgeBorder,
      highlightGlow,
      icon,
    };
  }

  // Active items ordered by priority: System Status Banner FIRST, Custom Announcement SECOND
  const activeBanners: BannerItem[] = [];
  if (systemAutoBanner) activeBanners.push(systemAutoBanner);
  if (customBanner) activeBanners.push(customBanner);

  // If no banners are active, render nothing
  if (activeBanners.length === 0) {
    return null;
  }

  const isMultiBanner = activeBanners.length > 1;
  const safeFrontIndex = isMultiBanner ? frontIndex % activeBanners.length : 0;
  const frontItem = activeBanners[safeFrontIndex] || activeBanners[0];
  const backItem = isMultiBanner ? activeBanners[1 - safeFrontIndex] : null;

  const handleSwap = () => {
    if (!isMultiBanner) return;
    setFrontIndex((prev) => (prev === 0 ? 1 : 0));
  };

  // Helper renderer for the Front Card (Full Content)
  const renderFrontCard = (item: BannerItem) => {
    const isTextExpanded = Boolean(expandedTextIds[item.id]);
    const hasTruncatedText = item.shortMessage && item.shortMessage !== item.message;
    const displayText = isTextExpanded || !hasTruncatedText ? item.message : item.shortMessage;

    return (
      <motion.div
        key={`front-${item.id}`}
        initial={{ opacity: 0.65, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{
          type: 'spring',
          stiffness: 340,
          damping: 26,
          mass: 0.75,
        }}
        className="w-full rounded-xl sm:rounded-2xl relative overflow-hidden backdrop-blur-md transition-shadow duration-200"
        style={{
          backgroundColor: 'var(--surface-primary)',
          border: `1px solid ${item.borderColor}`,
          boxShadow: isMultiBanner
            ? '0 12px 28px -6px rgba(0, 0, 0, 0.32), 0 4px 10px rgba(0, 0, 0, 0.08)'
            : 'var(--shadow-subtle)',
        }}
      >
        {/* Subtle accent top indicator line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
          style={{
            background: `linear-gradient(90deg, transparent, ${item.accentColor}, transparent)`,
          }}
        />

        <div className="p-2.5 sm:p-3.5">
          <div className="flex items-start justify-between gap-2.5 sm:gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              {/* Compact Icon Avatar with pulsing beacon for system alerts */}
              <div
                className="p-1.5 sm:p-2 rounded-lg flex items-center justify-center shrink-0 mt-0.5 relative"
                style={{
                  backgroundColor: item.badgeBg,
                  border: `1px solid ${item.badgeBorder}`,
                }}
              >
                {item.icon}
                {item.isSystemAuto && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--surface-primary)]"
                    style={{ backgroundColor: item.accentColor }}
                  >
                    <span
                      className="absolute inset-0 rounded-full animate-ping opacity-75"
                      style={{ backgroundColor: item.accentColor }}
                    />
                  </span>
                )}
              </div>

              {/* Message Body */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span
                    className="text-[9px] sm:text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.2 rounded-md inline-flex items-center gap-1"
                    style={{
                      backgroundColor: item.badgeBg,
                      color: item.badgeColor,
                      border: `1px solid ${item.badgeBorder}`,
                    }}
                  >
                    {item.badgeCategory}
                  </span>

                  <span
                    className="text-[9px] sm:text-[10px] font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {item.badgeSubText}
                  </span>

                  {/* Priority indicator when in a stacked deck */}
                  {isMultiBanner && (
                    <span
                      className={`text-[8px] sm:text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wide ${
                        item.isSystemAuto
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          : 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30'
                      }`}
                    >
                      {safeFrontIndex === 0 ? '1/2 • Aktif' : '2/2 • Aktif'}
                    </span>
                  )}
                </div>

                {/* Headline */}
                {item.headline && (
                  <h4
                    className="text-xs sm:text-[13px] font-bold tracking-tight mb-0.5 leading-snug"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {item.headline}
                  </h4>
                )}

                {/* Body message with inline "read more..." toggle */}
                <p
                  className="text-[11px] sm:text-xs font-medium leading-relaxed break-words"
                  style={{ color: 'var(--text-main)' }}
                >
                  <span>{displayText}</span>
                  {hasTruncatedText && (
                    <button
                      type="button"
                      id={`btn-readmore-${item.id}`}
                      onClick={(e) => toggleTextExpand(item.id, e)}
                      className="inline-flex items-center gap-0.5 ml-1.5 font-bold text-[10px] sm:text-[11px] text-accent hover:underline focus:outline-none cursor-pointer select-none transition-colors"
                      title={isTextExpanded ? 'Ringkas pesan' : 'Lihat pesan lengkap'}
                    >
                      <span>{isTextExpanded ? 'ringkas' : 'read more..'}</span>
                      {isTextExpanded ? (
                        <ChevronUp className="w-2.5 h-2.5 opacity-90" />
                      ) : (
                        <ChevronDown className="w-2.5 h-2.5 opacity-90" />
                      )}
                    </button>
                  )}
                </p>

                {/* Action Link (e.g. /status for system alerts) */}
                {item.actionUrl && (
                  <div className="mt-1.5 pt-1.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <a
                      href={item.actionUrl}
                      id={`link-${item.id}-status`}
                      className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold hover:underline focus:outline-none rounded transition-colors"
                      style={{ color: item.badgeColor }}
                    >
                      <span>{item.actionLabel || 'Lihat Status Server'}</span>
                      <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    </a>
                    <span className="text-[9px] sm:text-[10px] opacity-50" style={{ color: 'var(--text-muted)' }}>
                      Pembaruan real-time
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Top-Right Controls: iOS Stack Switcher & Dismiss Button */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* iOS Deck Swap Button */}
              {isMultiBanner && (
                <button
                  type="button"
                  id="btn-ios-stack-swap-top"
                  onClick={handleSwap}
                  className="inline-flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-lg text-[10px] font-bold tracking-tight transition-all duration-200 active:scale-95 cursor-pointer shadow-sm hover:brightness-110 select-none"
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  title="Ketuk untuk menukar posisi banner (ala iOS)"
                >
                  <Layers className="w-3 h-3 text-accent" />
                  <span>{safeFrontIndex + 1}/2</span>
                  <ArrowUpDown className="w-2.5 h-2.5 opacity-75" />
                </button>
              )}

              {/* Dismiss Button (for dismissible custom announcement) */}
              {item.dismissible && item.onDismiss && (
                <button
                  type="button"
                  id={`btn-dismiss-${item.id}`}
                  onClick={item.onDismiss}
                  className="p-1 sm:p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-all duration-200 shrink-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/40 active:scale-95"
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  title="Tutup pengumuman ini"
                  aria-label="Tutup pengumuman ini"
                >
                  <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <aside
      id="system-announcement-stack"
      className="w-full mb-3.5 sm:mb-4 relative"
      role="region"
      aria-label="Pemberitahuan dan Pengumuman Sistem"
    >
      {!isMultiBanner ? (
        /* =================================================================
         * SCENARIO 1: SINGLE BANNER (Clean Standalone Card)
         * ================================================================= */
        renderFrontCard(activeBanners[0])
      ) : (
        /* =================================================================
         * SCENARIO 2: TRUE iOS STACKED BANNER DECK
         * Compact, layered cards where tapping the peeking back card
         * smoothly promotes it to the front position with spring physics!
         * ================================================================= */
        <div className="relative select-none">
          {/* Top Layer: Active Front Banner */}
          <div className="relative z-20">
            <AnimatePresence mode="wait" initial={false}>
              {renderFrontCard(frontItem)}
            </AnimatePresence>
          </div>

          {/* Peeking Layer: Back Card (Clickable to Promote to Front) */}
          {backItem && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`back-${backItem.id}`}
                initial={{ opacity: 0.6, y: -10, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{
                  type: 'spring',
                  stiffness: 340,
                  damping: 26,
                  mass: 0.75,
                }}
                id="ios-stack-peek-deck"
                onClick={handleSwap}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSwap();
                  }
                }}
                className="relative z-10 -mt-2 sm:-mt-2.5 mx-auto w-[96%] rounded-b-xl pt-3 pb-2.5 px-3 sm:px-3.5 backdrop-blur-md cursor-pointer transition-all duration-200 group flex items-center justify-between gap-2.5 select-none hover:translate-y-0.5 active:scale-[0.985]"
                style={{
                  backgroundColor: 'var(--surface-primary)',
                  border: `1px solid ${backItem.borderColor}`,
                  borderTop: 'none',
                  boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.28)',
                }}
                title="Ketuk kartu ini untuk menaikkannya ke posisi depan (ala iOS)"
              >
                {/* Left: Indicator, Category Badge, and Truncated Message Preview */}
                <div className="flex items-center gap-2 min-w-0 flex-1 transition-opacity">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 relative"
                    style={{ backgroundColor: backItem.accentColor }}
                  >
                    <span
                      className="absolute inset-0 rounded-full animate-ping opacity-60"
                      style={{ backgroundColor: backItem.accentColor }}
                    />
                  </span>

                  <span
                    className="text-[9px] sm:text-[10px] font-bold shrink-0 uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: backItem.badgeBg,
                      color: backItem.badgeColor,
                      border: `1px solid ${backItem.badgeBorder}`,
                    }}
                  >
                    {backItem.badgeCategory}
                  </span>

                  <span
                    className="text-[11px] sm:text-xs font-semibold truncate"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {backItem.shortMessage || backItem.message}
                  </span>
                </div>

                {/* Right: iOS Swap Action Pill */}
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-bold shrink-0 transition-all duration-200 group-hover:scale-105 group-hover:bg-[var(--surface-hover)] group-active:scale-95"
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <ArrowUpDown className="w-3 h-3 text-accent transition-transform group-hover:rotate-180 duration-300" />
                  <span className="hidden xs:inline">Naikkan</span>
                  <span className="xs:hidden">Tukar</span>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Layer 3: iOS Bottom Depth Shelf (Creates the 3D Layered Perspective) */}
          <div
            className="relative z-0 -mt-1 mx-auto w-[92%] h-1.5 rounded-b-lg opacity-40 backdrop-blur-sm pointer-events-none"
            style={{
              backgroundColor: 'var(--surface-primary)',
              border: '1px solid var(--border-subtle)',
              borderTop: 'none',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.16)',
            }}
          />
        </div>
      )}
    </aside>
  );
};

