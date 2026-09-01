import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app';

const FUNCTION_MAX_DURATION_MS = 60000;
const catboxTimeoutMs = parseInt(process.env.CATBOX_TIMEOUT_MS || '60000', 10);

if (catboxTimeoutMs > FUNCTION_MAX_DURATION_MS) {
  console.warn(
    `[CONFIG_WARN] CATBOX_TIMEOUT_MS (${catboxTimeoutMs}ms) dikonfigurasi melebihi serverless maxDuration (${FUNCTION_MAX_DURATION_MS}ms). Permintaan berisiko diputus lebih awal oleh Vercel.`
  );
}

// Disable Vercel's default body parser so Express & Multer receive the raw multipart stream directly
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
