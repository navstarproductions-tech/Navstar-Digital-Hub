# Navstar private Cloudflare R2 storage

## What this change adds

The application now has a centralized private-storage foundation:
- A new `NAVSTAR_STORAGE` R2 binding for `navstar-digital-hub-storage`.
- Server-side AWS Signature Version 4 presigning using Web Crypto (no R2 credentials are sent to the browser).
- Short-lived direct browser-to-R2 PUT URLs and short-lived authorized GET URLs.
- Upload-intent records, post-upload object verification, MIME/extension and file-signature checks.
- Central `stored_files` metadata and soft-delete/restore support.
- An administrator Storage Management workspace under ICT Portal, with a Settings shortcut.
- Existing `DOCS` and `MEDIA` bindings are intentionally retained while legacy objects are migrated and verified.

## Required Cloudflare setup

1. In Cloudflare R2, create a bucket named **navstar-digital-hub-storage**. Keep public access disabled.
2. Create an R2 API token with Object Read and Object Write permissions scoped only to this bucket.
3. In the Cloudflare Pages project settings, add these as server-side secrets/environment variables for both Production and Preview as appropriate:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME=navstar-digital-hub-storage`
   - `R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
4. Confirm the `NAVSTAR_STORAGE` R2 binding in `wrangler.toml` points to the bucket created in step 1.
5. Configure the bucket's CORS policy in the R2 dashboard. Add the actual production and preview origins used by this Pages project. Example (replace the origins with the real deployed hostnames):
```json
[
  {
    "AllowedOrigins": [
      "https://navstar-digital-hub-site.pages.dev",
      "https://YOUR-CUSTOM-DOMAIN"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
6. Apply the additive D1 migrations:
```sh
npx wrangler d1 migrations apply navstar-digital-hub --remote
```
7. Deploy the branch to a preview environment and open Admin Portal → ICT Portal → Storage Management. The connection indicator should report that the private bucket is reachable.

## API flow

- `POST /api/storage/upload-url`: authenticated role/module check, validates metadata, creates a five-minute upload intent, and returns a presigned PUT URL.
- Browser sends the file directly to R2 with the declared `Content-Type`.
- `POST /api/storage/complete`: checks intent ownership/expiry, verifies object size, stored content type and initial file signature, then creates the metadata record and audit entry.
- `POST /api/storage/cancel`: removes an unfinished upload intent and its temporary object.
- `GET /api/storage/files`: administrator file listing with search, module/type/status filters and pagination.
- `GET /api/storage/files/:id`: checks file ownership/role and issues a short-lived download URL using the administrator-configured expiry.
- `DELETE /api/storage/files/:id`: soft-deletes metadata; the R2 object is retained.
- `POST /api/storage/files/:id`: restores a soft-deleted file only if the R2 object still exists.
- `GET /api/storage/overview`: bucket connectivity and metadata-based usage statistics.
- `GET /api/storage/public/:id`: issues a short-lived URL only for an active file explicitly marked public.

## Important migration and rollout notes

- Do not delete the existing `DOCS` or `MEDIA` buckets. Existing profile photos, public media, employee documents and forum images still use their legacy routes until each module is migrated and verified.
- The dashboard labels legacy object counts separately. No existing file is automatically moved or deleted by this release.
- The storage usage figure is calculated from Navstar's metadata. It is not Cloudflare billing data or a provider-side bucket inventory.
- The administrator can configure upload-size limits, download-link expiry, allowed extensions, a usage-alert threshold and a retention policy. The retention setting is informational in this release; no automatic purge runs.
- The legacy migration workspace currently inventories media assets, employee documents, downloadable documents, forum images and staff-application documents. It copies and verifies each selected file, updates the application's reference and retains the original object in the old bucket.
- New profile photos, gallery/branding images, employee documents, public downloads, forum images, private course resources and student assignment/project attachments use the central bucket when the binding, secrets and migrations are configured. The old routes remain available for existing records.
- New direct uploads currently use a 25 MB default limit and a 100 MB limit for audio/video. The supported MIME types and extensions are validated together, and the uploaded file's initial bytes are checked before metadata is registered.
- Direct presigned public uploads are restricted to administrators and approved gallery, photography and course modules. Server-side publishing routes also support public institutional downloads and community forum images. All other new uploads default to private; the R2 bucket itself remains private.
- Students can upload only to project, assignment, application and scholarship modules; tutors, admissions and finance roles have narrower module permissions. Private downloads are available to the owner and administrators/principals.
- The storage system cannot be declared production-ready until the bucket, CORS origins, secrets and D1 migration are configured and tested against the actual Cloudflare account.

## Other component integrations in this branch

- Practical assessment marks use the weighted 10-point rubric: Accuracy (3), Speed (2), Presentation (2), Understanding (2) and Safety (1). Each criterion is stored separately and displayed in the marks register.
- The student project workspace exports graded submissions into a branded portfolio PDF.
- Class rating now supports a configurable form builder with the 20 standard questions, custom rating/text/comment/choice fields, one active form at a time, required-question validation, student submissions per accepted course and administrator response analysis. Existing one-rating-per-course records remain available.

## Rollback

This migration is additive. To roll back the application feature, revert the Storage Management navigation/import and the new `functions/api/storage` and `functions/_shared/storage.js` files on the deployment branch. Keep the D1 tables and R2 bucket until confirming no stored file metadata or objects depend on them. Existing `DOCS` and `MEDIA` bindings remain unchanged.
