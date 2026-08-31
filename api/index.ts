import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/server/app';

// Disable Vercel's default body parser so Express & Multer receive the raw multipart stream directly
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
