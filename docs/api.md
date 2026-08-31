# AirShare Pro API Specification

The AirShare Pro server exposes a clean REST API under the `/api/media` namespace.

---

## 1. Get Server Configuration

Retrieve active non-sensitive upload configuration and provider limits.

- **Method**: `GET`
- **Path**: `/api/media/config`
- **Rate Limit**: 120 requests / minute
- **Auth**: None

### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "maxUploadSize": 209715200,
    "formattedMaxSize": "200 MB",
    "provider": "catbox",
    "isDeleteSupported": false,
    "rateLimitUploadsPerMinute": 20
  }
}
```

---

## 2. Upload Media

Upload an image, video, or audio file to Catbox storage.

- **Method**: `POST`
- **Path**: `/api/media/upload`
- **Content-Type**: `multipart/form-data`
- **Rate Limit**: 20 requests / minute (Configurable via `RATE_LIMIT_MAX_UPLOADS_PER_MIN`)
- **Auth**: None

### Request Body (Multipart)
| Field | Type | Description | Required |
| --- | --- | --- | --- |
| `file` | File Buffer | Binary payload (image, video, or audio) | Yes |
| `metadata` | JSON String | Optional client metadata (`imageMeta`, `videoMeta`, `audioMeta`) | No |

### Response (`201 Created`)
```json
{
  "success": true,
  "data": {
    "id": "abc1234.mp4",
    "name": "summer_vacation_clip.mp4",
    "originalFileName": "summer vacation clip.mp4",
    "size": 15728640,
    "formattedSize": "15.0 MB",
    "type": "video",
    "mimeType": "video/mp4",
    "shareUrl": "https://files.catbox.moe/abc1234.mp4",
    "provider": "catbox",
    "createdAt": 1772359421000,
    "videoMeta": {
      "duration": 42.5,
      "width": 1920,
      "height": 1080
    }
  }
}
```

### Errors
- `400 Bad Request`: `NO_FILE`, `FORBIDDEN_EXTENSION`, `UNSUPPORTED_MEDIA_TYPE`, `CORRUPTED_OR_INVALID_MEDIA`, `INVALID_MULTIPART_REQUEST`, `INVALID_JSON`
- `405 Method Not Allowed`: `METHOD_NOT_ALLOWED` (returns `Allow` header listing allowed HTTP verbs)
- `413 Payload Too Large`: `FILE_TOO_LARGE`
- `429 Too Many Requests`: `RATE_LIMITED`
- `502 Bad Gateway`: `PROVIDER_ERROR`, `UPLOAD_TIMEOUT`

---

## 3. List Stored Media

Retrieve media items recorded in the server repository.

- **Method**: `GET`
- **Path**: `/api/media`
- **Query Parameters**:
  - `limit` (integer, optional, default `100`, max `200`): Maximum records to retrieve.
- **Rate Limit**: 120 requests / minute

### Response (`200 OK`)
```json
{
  "success": true,
  "data": [
    {
      "id": "abc1234.mp4",
      "name": "summer_vacation_clip.mp4",
      "originalFileName": "summer vacation clip.mp4",
      "size": 15728640,
      "formattedSize": "15.0 MB",
      "type": "video",
      "mimeType": "video/mp4",
      "shareUrl": "https://files.catbox.moe/abc1234.mp4",
      "provider": "catbox",
      "createdAt": 1772359421000
    }
  ]
}
```

---

## 4. Get Media by ID

Retrieve a single media record by its unique identifier.

- **Method**: `GET`
- **Path**: `/api/media/:id`
- **Parameters**: `id` (alphanumeric media identifier)
- **Rate Limit**: 120 requests / minute

### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "abc1234.mp4",
    "name": "summer_vacation_clip.mp4",
    "shareUrl": "https://files.catbox.moe/abc1234.mp4",
    "size": 15728640,
    "type": "video"
  }
}
```

### Errors
- `400 Bad Request`: `INVALID_ID`
- `404 Not Found`: `NOT_FOUND`

---

## 5. Delete Media Item

Delete a media item from the repository and trigger upstream Catbox deletion if `CATBOX_USERHASH` is configured.

- **Method**: `DELETE`
- **Path**: `/api/media/:id`
- **Parameters**: `id` (alphanumeric media identifier)

### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "deletedId": "abc1234.mp4",
    "providerResult": {
      "success": true,
      "supported": true,
      "message": "Berkas berhasil dihapus dari Catbox."
    }
  }
}
```
*Note: If `CATBOX_USERHASH` is not configured, `supported` is `false` and the file is removed from local application history.*

---

## 6. Clear All Media

Clear all media entries from the repository.

- **Method**: `DELETE`
- **Path**: `/api/media`

### Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "cleared": true
  }
}
```

---

## 7. System Health Check

- **Method**: `GET`
- **Path**: `/api/health`

### Response (`200 OK`)
```json
{
  "status": "ok",
  "service": "AirShare Pro API",
  "timestamp": "2026-08-30T09:46:00.000Z",
  "storageProvider": "catbox",
  "hasUserhash": false
}
```

---

*Copyright (c) 2026 AryaXzell. All rights reserved.*
