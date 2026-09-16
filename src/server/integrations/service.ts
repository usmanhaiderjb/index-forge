import "server-only";

import { Provider, type Connection } from "@prisma/client";

import { decryptJson, encryptJson } from "@/server/crypto";
import { db } from "@/server/db";
import { getConnector } from "@/server/integrations/registry";
import {
  ReauthRequiredError,
  type IntegrationCredentials,
  type RemoteResource,
} from "@/server/integrations/types";

/** Reads and decrypts a connection's credentials, or throws a re-auth error. */
export function loadCredentials(connection: Connection): IntegrationCredentials {
  if (!connection.credentials) {
    throw new ReauthRequiredError("This connection has no stored credentials");
  }
  try {
    return decryptJson<IntegrationCredentials>(connection.credentials);
  } catch {
    throw new ReauthRequiredError(
      "Stored credentials could not be decrypted. If ENCRYPTION_KEY was rotated, reconnect this integration.",
    );
  }
}

export async function saveCredentials(
  connectionId: string,
  credentials: IntegrationCredentials,
) {
  await db.connection.update({
    where: { id: connectionId },
    data: {
      credentials: encryptJson(credentials),
      status: "ACTIVE",
      lastError: null,
      errorCount: 0,
    },
  });
}

/**
 * Records a failure against a connection. Three consecutive hard failures park
 * it in ERROR so the scheduler stops burning quota on it.
 */
export async function recordConnectionError(connectionId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const needsReauth = error instanceof ReauthRequiredError;

  const current = await db.connection.findUnique({
    where: { id: connectionId },
    select: { errorCount: true },
  });
  const errorCount = (current?.errorCount ?? 0) + 1;

  await db.connection.update({
    where: { id: connectionId },
    data: {
      lastError: message.slice(0, 2000),
      errorCount,
      status: needsReauth ? "NEEDS_REAUTH" : errorCount >= 3 ? "ERROR" : undefined,
    },
  });
}

export async function testConnection(connectionId: string) {
  const connection = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  const connector = getConnector(connection.provider);

  try {
    const credentials = loadCredentials(connection);
    const result = await connector.test(credentials, connection);

    await db.connection.update({
      where: { id: connectionId },
      data: {
        status: result.ok ? "ACTIVE" : "ERROR",
        lastError: result.ok ? null : result.detail.slice(0, 2000),
        errorCount: result.ok ? 0 : { increment: 1 },
        externalName: result.externalName ?? connection.externalName,
      },
    });
    return result;
  } catch (error) {
    await recordConnectionError(connectionId, error);
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function listRemoteResources(connectionId: string): Promise<RemoteResource[]> {
  const connection = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  const connector = getConnector(connection.provider);

  try {
    const credentials = loadCredentials(connection);
    return await connector.listResources(credentials, connection);
  } catch (error) {
    await recordConnectionError(connectionId, error);
    throw error;
  }
}

/**
 * Matches remote resources to apps already in the organization so linking is
 * one click instead of a manual mapping exercise. Matches on store id first,
 * then bundle id, then a normalized name.
 */
export async function suggestResourceLinks(connectionId: string) {
  const connection = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  const [resources, apps] = await Promise.all([
    listRemoteResources(connectionId),
    db.app.findMany({ where: { organizationId: connection.organizationId } }),
  ]);

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  return resources.map((resource) => {
    const match =
      apps.find((a) => resource.storeId && a.storeId === resource.storeId) ??
      apps.find((a) => resource.bundleId && a.bundleId === resource.bundleId) ??
      apps.find((a) => normalize(a.name) === normalize(resource.name));

    return { resource, suggestedAppId: match?.id ?? null };
  });
}

export const PROVIDERS_WITH_REVIEWS: Provider[] = [
  Provider.PLAY_CONSOLE,
  Provider.APP_STORE_CONNECT,
];
