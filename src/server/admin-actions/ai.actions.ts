import { Request, Response } from 'express';
import { analyticsRepository, getTodayDateString } from '../repository/analytics-repository';
import { checkCatboxHealth } from '../storage/catbox-health-check';
import { checkRedisHealth } from '../storage/redis-client';
import { DailyStats, WeeklyTrendItem } from '../../types';

const configuredModel = process.env.GEMINI_MODEL?.trim();
// Default to gemini-2.5-flash for stability and high responsiveness
export const GEMINI_MODEL_NAME = (!configuredModel || configuredModel === 'gemini-3.8-flash' || configuredModel.toLowerCase().includes('3.8'))
  ? 'gemini-2.5-flash'
  : configuredModel;

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Pure function: Generates data-driven conditional recommendations
 * based on current analytics without altering page structure.
 */
export function generateRecommendations(
  stats: DailyStats,
  weeklyTrend: WeeklyTrendItem[],
  topFiles: { id: string; name?: string; views: number }[],
  maxUploadSize = 209715200 // 200MB
): string[] {
  const recommendations: string[] = [];

  // 1. Average file size check
  if (stats.uploads > 0 && stats.averageFileSize > maxUploadSize * 0.5) {
    recommendations.push(
      `Rata-rata ukuran file hari ini (${stats.formattedAverageSize}) mendekati ambang batas kapasitas 200 MB. Pertimbangkan menaikkan batas upload atau mengoptimalkan kompresi sisi klien pada format video/audio.`
    );
  }

  // 2. Outlier view check on popular files
  if (topFiles.length > 0 && topFiles[0].views > 50) {
    const top = topFiles[0];
    const totalViews = stats.totalViews || 1;
    if (top.views > totalViews * 0.4 || top.views >= 100) {
      recommendations.push(
        `Berkas "${escapeHtml(top.name || top.id)}" sangat populer dengan ${top.views} tayangan. Pertimbangkan integrasi CDN edge caching tambahan atau rate limit tayangan yang lebih ketat guna mencegah lonjakan pemakaian bandwidth Catbox.`
      );
    }
  }

  // 3. Country dominance check (>70%)
  const totalCountryUploads = Object.values(stats.byCountry).reduce((sum, count) => sum + count, 0);
  if (totalCountryUploads >= 5) {
    for (const [code, count] of Object.entries(stats.byCountry)) {
      if (code !== 'UNKNOWN' && count / totalCountryUploads > 0.7) {
        recommendations.push(
          `Lebih dari 70% (${Math.round((count / totalCountryUploads) * 100)}%) unggahan hari ini berasal dari negara ${code}. Pertimbangkan menambahkan CDN atau server edge region yang lebih dekat dengan basis pengguna utama Anda.`
        );
        break;
      }
    }
  }

  // 4. Weekly trend comparison
  if (weeklyTrend.length >= 4) {
    const pastDays = weeklyTrend.slice(0, weeklyTrend.length - 1);
    const pastUploadsSum = pastDays.reduce((sum, d) => sum + d.uploads, 0);
    const avgPastUploads = pastDays.length > 0 ? pastUploadsSum / pastDays.length : 0;

    if (avgPastUploads >= 5 && stats.uploads < avgPastUploads * 0.4) {
      recommendations.push(
        `Aktivitas unggahan hari ini (${stats.uploads}) terpantau menurun signifikan dibanding rata-rata 7 hari terakhir (${Math.round(avgPastUploads)} unggahan/hari). Pertimbangkan meninjau kanal distribusi atau promosi platform.`
      );
    }
  }

  // Default baseline recommendation if none triggered
  if (recommendations.length === 0) {
    recommendations.push(
      'Semua metrik sistem berjalan dalam batas normal. Rasio ukuran berkas dan lalu lintas tayangan dalam kondisi sehat.'
    );
    recommendations.push(
      'Koneksi penyimpanan Catbox dan basis data analitik beroperasi dengan latensi optimal.'
    );
  }

  return recommendations;
}

export async function getAiRecommendations(req: Request, res: Response): Promise<void> {
  const todayStr = getTodayDateString();

  try {
    const [todayStats, weeklyTrend, topFiles, catboxHealth, redisHealth, totalItems] = await Promise.all([
      analyticsRepository.getDailySummary(todayStr),
      analyticsRepository.getWeeklyTrend(),
      analyticsRepository.getTopFiles(10),
      checkCatboxHealth(),
      checkRedisHealth(),
      analyticsRepository.getTotalItemsEver(),
    ]);

    const heuristicRecs = generateRecommendations(todayStats, weeklyTrend, topFiles);
    const fallbackSummary = `Sistem mencatat total **${todayStats.uploads} unggahan** (${todayStats.formattedBytes}) dengan **${todayStats.totalViews} kunjungan** pada hari ini. Status penyimpanan Catbox saat ini: \`${catboxHealth.available ? 'TERSEDIA' : 'TERGANGGU'}\`.`;

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.trim().length === 0) {
      res.json({
        success: true,
        isAi: false,
        model: 'heuristic-engine',
        summary: fallbackSummary,
        recommendations: heuristicRecs,
        generatedAt: Date.now(),
        error: 'GEMINI_API_KEY belum dikonfigurasi di environment hosting. Menampilkan hasil analisis heuristik bawaan.',
      });
      return;
    }

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
          timeout: 30000,
        },
      });

      const prompt = `Anda adalah asisten AI Analitik Sistem dan Infrastruktur untuk AirShare Pro (platform berbagi berkas media berkinerja tinggi).
Analisis metrik sistem real-time berikut ini dan berikan ringkasan eksekutif beserta rekomendasi strategis dalam format JSON:

DATA SISTEM REAL-TIME:
- Tanggal: ${todayStats.date}
- Unggahan Hari Ini: ${todayStats.uploads} berkas (${todayStats.formattedBytes})
- Rata-rata Ukuran Berkas: ${todayStats.formattedAverageSize}
- Total Berkas Tersimpan Aktif: ${totalItems} berkas
- Total Kunjungan Share Hari Ini: ${todayStats.totalViews} kali
- Distribusi Tipe Media: ${JSON.stringify(todayStats.byType)}
- Distribusi Negara Pengunggah: ${JSON.stringify(todayStats.byCountry)}
- Berkas Paling Sering Dilihat: ${JSON.stringify(topFiles.map((f) => ({ id: f.id, views: f.views })))}
- Status Catbox Storage: ${catboxHealth.available ? 'TERSEDIA' : 'TERGANGGU'} (${catboxHealth.latencyMs !== null ? `${catboxHealth.latencyMs}ms` : 'N/A'})
- Status Upstash Redis: ${redisHealth.connected ? 'TERHUBUNG' : (redisHealth.configured ? 'DISCONNECTED' : 'LOCAL IN-MEMORY')} (${redisHealth.latencyMs !== null ? `${redisHealth.latencyMs}ms` : 'N/A'})
- Tren 7 Hari Terakhir: ${weeklyTrend.map((w) => `${w.date}: ${w.uploads} unggahan (${w.formattedBytes})`).join(', ')}

INSTRUKSI OUTPUT:
Hasilkan respons JSON valid dengan struktur:
{
  "summary": "Ringkasan eksekutif 2-3 kalimat mengenai status sistem, tren volume beban, dan efisiensi penyimpanan saat ini. Boleh menggunakan format Markdown (seperti **bold** atau \`code\`).",
  "recommendations": [
    "Rekomendasi 1 yang terarah (boleh gunakan **bold** dan \`code\`)",
    "Rekomendasi 2",
    "Rekomendasi 3",
    "Rekomendasi 4"
  ]
}
Pastikan rekomendasi berfokus pada optimasi bandwidth, proteksi kuota penyimpanan, retensi data, dan keamanan operasional.`;

      let usedModel = GEMINI_MODEL_NAME;
      let response: any;
      try {
        response = await ai.models.generateContent({
          model: usedModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
      } catch (initialErr: any) {
        // If the configured model failed and wasn't gemini-2.5-flash, attempt fallback to gemini-2.5-flash
        if (usedModel !== 'gemini-2.5-flash') {
          console.warn(`[GEMINI_RECOMMENDATION_WARN] Model ${usedModel} mengalami kendala (${initialErr?.message || initialErr}), mencoba model cadangan gemini-2.5-flash...`);
          usedModel = 'gemini-2.5-flash';
          try {
            response = await ai.models.generateContent({
              model: usedModel,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
              },
            });
          } catch (fallbackErr: any) {
            console.warn(`[GEMINI_RECOMMENDATION_WARN] Fallback JSON mode gagal, mencoba panggilan standar tanpa mimeType constraint...`);
            response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt + '\n\nPERINGATAN: Berikan respons HANYA objek JSON valid.',
            });
          }
        } else {
          // Attempt standard generation without mimeType constraint if json mode failed
          console.warn(`[GEMINI_RECOMMENDATION_WARN] Mode JSON gemini-2.5-flash mengalami kendala (${initialErr?.message || initialErr}), mencoba panggilan standar...`);
          try {
            response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt + '\n\nPERINGATAN: Berikan respons HANYA objek JSON valid.',
            });
          } catch {
            throw initialErr;
          }
        }
      }

      const rawText = response?.text?.trim() || '';
      let parsedResponse: { summary?: string; recommendations?: string[] } | null = null;
      try {
        parsedResponse = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        }
      }

      if (parsedResponse && (parsedResponse.summary || (Array.isArray(parsedResponse.recommendations) && parsedResponse.recommendations.length > 0))) {
        res.json({
          success: true,
          isAi: true,
          model: usedModel,
          summary: parsedResponse.summary || 'Sistem beroperasi normal dengan parameter kapasitas optimal.',
          recommendations: Array.isArray(parsedResponse.recommendations) && parsedResponse.recommendations.length > 0
            ? parsedResponse.recommendations
            : heuristicRecs,
          generatedAt: Date.now(),
        });
        return;
      }

      res.json({
        success: true,
        isAi: false,
        model: 'heuristic-engine',
        summary: fallbackSummary,
        recommendations: heuristicRecs,
        generatedAt: Date.now(),
        error: 'Respon dari Gemini API tidak dalam format yang diharapkan. Menampilkan hasil analisis heuristik sebagai gantinya.',
      });
      return;
    } catch (geminiErr: any) {
      console.warn('[GEMINI_RECOMMENDATION_WARN] Gagal menghubungi Gemini API, fallback ke heuristik:', geminiErr?.message || geminiErr);
      res.json({
        success: true,
        isAi: false,
        model: 'heuristic-engine',
        summary: fallbackSummary,
        recommendations: heuristicRecs,
        generatedAt: Date.now(),
        error: `Gemini API mengalami kendala: ${geminiErr?.message || 'Gagal terhubung ke layanan AI.'}. Menampilkan hasil analisis heuristik sebagai gantinya.`,
      });
      return;
    }
  } catch (err: any) {
    console.error('[AI_RECOMMENDATIONS_ERROR]', err);
    res.status(500).json({
      success: false,
      error: 'Gagal menghasilkan analisis rekomendasi AI. Silakan coba beberapa saat lagi.',
    });
  }
}
