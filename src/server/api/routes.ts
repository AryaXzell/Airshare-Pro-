import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { mediaController } from './media-controller';
import { rateLimitMiddleware } from '../security/rate-limiter';
import { ApiErrorResponse } from '../../types';

const router = Router();

const MAX_UPLOAD_SIZE = parseInt(
  process.env.MAX_UPLOAD_SIZE || '209715200',
  10
);

// Multer memory storage configured with maximum file limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1, // Enforce single file per request
  },
});

// Middleware to handle Multer errors cleanly and return structured JSON
function handleMulterErrors(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const errorResp: ApiErrorResponse = {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `Ukuran berkas melebihi batas maksimal ${(MAX_UPLOAD_SIZE / (1024 * 1024)).toFixed(0)} MB.`,
        },
      };
      res.status(413).json(errorResp);
      return;
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      const errorResp: ApiErrorResponse = {
        success: false,
        error: {
          code: 'TOO_MANY_FILES',
          message: 'Hanya 1 berkas per permintaan yang diizinkan.',
        },
      };
      res.status(400).json(errorResp);
      return;
    }

    const errorResp: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INVALID_MULTIPART_REQUEST',
        message: err.message,
      },
    };
    res.status(400).json(errorResp);
    return;
  }

  if (err) {
    next(err);
    return;
  }

  next();
}

// Rate limiters
const uploadRateLimiter = rateLimitMiddleware({
  limit: parseInt(process.env.RATE_LIMIT_MAX_UPLOADS_PER_MIN || '20', 10),
  windowMs: 60 * 1000,
  keyPrefix: 'upload_ip',
});

const standardRateLimiter = rateLimitMiddleware({
  limit: 120,
  windowMs: 60 * 1000,
  keyPrefix: 'media_general_ip',
});

// Media Routes
router.get('/config', standardRateLimiter, mediaController.getConfig);

router.post(
  '/upload',
  uploadRateLimiter,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      handleMulterErrors(err, req, res, next);
    });
  },
  mediaController.uploadMedia
);

router.get('/', standardRateLimiter, mediaController.listMedia);
router.get('/:id', standardRateLimiter, mediaController.getMedia);
router.delete('/:id', standardRateLimiter, mediaController.deleteMedia);
router.delete('/', standardRateLimiter, mediaController.clearAllMedia);

export { router as mediaRouter };
