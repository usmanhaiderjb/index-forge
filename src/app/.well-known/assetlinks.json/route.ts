import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Android App Links verification.
 *
 * Android fetches this over HTTPS to confirm the site and the app belong to the
 * same owner. Without it, `autoVerify` fails silently and every link opens a
 * browser chooser instead of the app — which looks like the app is broken.
 *
 * The fingerprint is the SHA-256 of the signing certificate. For an EAS build:
 *
 *   eas credentials            # Android → production → keystore
 *
 * Play App Signing re-signs on Google's side, so the fingerprint that matters
 * is the one Play Console shows under Setup → App integrity, not the local one.
 */
export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!packageName || fingerprints.length === 0) {
    // 404 rather than an empty document: a malformed assetlinks file is worse
    // than an absent one, because Android caches the failure.
    return new NextResponse("Not configured", { status: 404 });
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
