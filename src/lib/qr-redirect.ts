/**
 * Columns the `/qr-ref?go=<slug>` redirect needs. Deliberately excludes
 * `logo_url`, which holds a whole image as a data: URL — a scan shouldn't
 * download it.
 */
export const QR_REDIRECT_COLUMNS = 'id,slug,target_url,is_active,expires_at,scan_count';
