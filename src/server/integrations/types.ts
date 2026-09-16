import type { Connection, MetricKey, MetricSource, Provider } from "@prisma/client";

/**
 * Decrypted credential blob. Shape depends on the provider; consumers narrow
 * with the `kind` discriminator.
 */
export type GoogleCredentials = {
  kind: "google-oauth";
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
  idToken?: string;
};

export type AppleCredentials = {
  kind: "apple-asc";
  issuerId: string;
  keyId: string;
  /** PEM contents of the .p8 key. */
  privateKey: string;
  /** Optional vendor number, required for Sales & Trends reports. */
  vendorNumber?: string;
};

/**
 * Apple Search Ads is a separate API from App Store Connect with separate
 * credentials: an OAuth client whose secret is a self-signed ES256 JWT. The
 * .p8 key is a different key, from a different console, with a different
 * audience — reusing the ASC one silently fails auth.
 */
export type AppleSearchAdsCredentials = {
  kind: "apple-search-ads";
  clientId: string;
  teamId: string;
  keyId: string;
  /** PEM contents of the Search Ads .p8 key. */
  privateKey: string;
  /** Numeric org id sent as X-AP-Context on every request. */
  orgId: string;
  currency?: string;
  timeZone?: string;
};

export type GoogleServiceAccountCredentials = {
  kind: "google-service-account";
  clientEmail: string;
  privateKey: string;
  projectId?: string;
};

export type IntegrationCredentials =
  | GoogleCredentials
  | AppleCredentials
  | AppleSearchAdsCredentials
  | GoogleServiceAccountCredentials;

/** A resource inside a connected account that can be linked to one of our Apps. */
export type RemoteResource = {
  /** Provider-native id: Firebase app id, AdMob app id, Ads customer id, package name, ASC app id. */
  externalId: string;
  name: string;
  /** Secondary id, e.g. the GA4 property backing a Firebase app. */
  externalRef?: string;
  platform?: "IOS" | "ANDROID";
  /** Store identifier when the provider exposes one, used for auto-matching. */
  storeId?: string;
  bundleId?: string;
  metadata?: Record<string, unknown>;
};

export type MetricRow = {
  date: Date;
  metric: MetricKey;
  value: number;
  /** "" for app-wide. Otherwise "country=us|campaign=123". */
  dimension?: string;
  currency?: string;
  meta?: Record<string, unknown>;
};

export type ReviewRow = {
  externalId: string;
  rating: number;
  title?: string;
  body?: string;
  authorName?: string;
  locale?: string;
  country?: string;
  appVersion?: string;
  device?: string;
  submittedAt: Date;
  developerReply?: string;
  repliedAt?: Date;
};

export type FetchContext = {
  connection: Connection;
  credentials: IntegrationCredentials;
  /** The resource id linked to the app being synced. */
  externalId: string;
  externalRef?: string | null;
  /** Inclusive UTC date range. */
  start: Date;
  end: Date;
  /** Provider-native metadata captured when the link was created. */
  linkMetadata?: Record<string, unknown> | null;
};

export type TestResult = {
  ok: boolean;
  detail: string;
  externalId?: string;
  externalName?: string;
};

export interface Connector {
  provider: Provider;
  source: MetricSource;
  /** OAuth scopes this connector needs. Empty for key-based providers. */
  scopes: string[];
  /** Verifies stored credentials still work and returns account identity. */
  test(credentials: IntegrationCredentials, connection: Connection): Promise<TestResult>;
  /** Lists linkable resources in the connected account. */
  listResources(credentials: IntegrationCredentials, connection: Connection): Promise<RemoteResource[]>;
  /** Pulls metrics for one linked resource over a date range. */
  fetchMetrics(ctx: FetchContext): Promise<MetricRow[]>;
  /** Only Play Console and App Store Connect expose reviews. */
  fetchReviews?(ctx: FetchContext): Promise<ReviewRow[]>;
  /**
   * Publishes a developer reply. This is public, user-visible content on the
   * store — implementations must not retry blindly on an ambiguous failure, or
   * a timeout becomes two published replies.
   */
  replyToReview?(
    ctx: Omit<FetchContext, "start" | "end">,
    reviewExternalId: string,
    body: string,
  ): Promise<void>;
  /** Maximum reply length the store accepts, in characters. */
  replyCharLimit?: number;
}

/** Thrown when the upstream told us the grant is gone; flips the connection to NEEDS_REAUTH. */
export class ReauthRequiredError extends Error {
  constructor(message = "Re-authorization required") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

/** Thrown when the connector is wired but the deployment is missing a key. */
export class IntegrationNotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured on this deployment`);
    this.name = "IntegrationNotConfiguredError";
  }
}

/**
 * Re-exported so connectors keep importing dimension helpers from here, while
 * the definition itself lives in @aso/shared alongside the traffic-source
 * vocabulary that uses it.
 */
export { buildDimension, parseDimension } from "@aso/shared";

