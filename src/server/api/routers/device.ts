import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { listDeviceSessions, revokeDeviceSession } from "@/server/mobile-auth";

/**
 * Device and notification management.
 *
 * `protectedProcedure` rather than `orgProcedure`: a device belongs to a user,
 * not to an organization. Someone in two workspaces has one phone.
 */
export const deviceRouter = createTRPCRouter({
  /** The device list for the settings screen, on web and mobile. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await listDeviceSessions(ctx.session.user.id);

    return sessions.map((session) => ({
      ...session,
      // So the UI can label "this device" rather than making someone guess
      // which of three iPhones they are holding.
      isCurrent: session.id === ctx.deviceSessionId,
    }));
  }),

  /** Sign a device out remotely — a lost phone, or one that was replaced. */
  revoke: protectedProcedure
    .input(z.object({ sessionId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Scoped to the caller's own sessions. Without this check any signed-in
      // user could revoke any device by guessing an id.
      const owned = await ctx.db.deviceSession.findFirst({
        where: { id: input.sessionId, userId: ctx.session.user.id },
        select: { id: true },
      });

      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });

      await revokeDeviceSession(input.sessionId, "revoked by user");
      return { ok: true as const };
    }),

  /**
   * Registers an Expo push token for the calling device.
   *
   * Requires a device session, so this is reachable only from the app. The
   * token is keyed on the session: re-registering replaces rather than
   * accumulating, which is what stops one phone getting an alert twice.
   */
  registerPush: protectedProcedure
    .input(
      z.object({
        token: z.string().regex(/^ExponentPushToken\[[^\]]+\]$/, "Not an Expo push token"),
        platform: z.enum(["IOS", "ANDROID"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.deviceSessionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Push registration requires a device session. Sign in from the app.",
        });
      }

      // The same physical device can reappear with a new session after a
      // reinstall, and Expo may reissue the identical token. Clear any prior
      // holder so the unique constraint does not reject a legitimate re-register.
      await ctx.db.deviceToken.deleteMany({
        where: { token: input.token, deviceSessionId: { not: ctx.deviceSessionId } },
      });

      const saved = await ctx.db.deviceToken.upsert({
        where: { deviceSessionId: ctx.deviceSessionId },
        create: {
          deviceSessionId: ctx.deviceSessionId,
          userId: ctx.session.user.id,
          token: input.token,
          platform: input.platform,
        },
        update: {
          token: input.token,
          platform: input.platform,
          // A re-register means the device is alive again, so clear any
          // previous DeviceNotRegistered verdict.
          invalidatedAt: null,
          invalidReason: null,
        },
      });

      return { id: saved.id };
    }),

  /** Turns push off for this device without signing out. */
  unregisterPush: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.deviceSessionId) return { ok: true as const };

    await ctx.db.deviceToken.deleteMany({
      where: { deviceSessionId: ctx.deviceSessionId },
    });
    return { ok: true as const };
  }),

  /** Notification preferences. Defaults are returned when none are saved. */
  preferences: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.db.notificationPreference.findUnique({
      where: { userId: ctx.session.user.id },
    });

    return (
      prefs ?? {
        pushEnabled: true,
        minSeverity: "MEDIUM" as const,
        quietHoursFrom: null,
        quietHoursTo: null,
        timeZone: "UTC",
      }
    );
  }),

  setPreferences: protectedProcedure
    .input(
      z.object({
        pushEnabled: z.boolean(),
        minSeverity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        quietHoursFrom: z.number().int().min(0).max(23).nullable(),
        quietHoursTo: z.number().int().min(0).max(23).nullable(),
        timeZone: z.string().max(64),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Both ends or neither. One alone is a window with no other edge, and
      // silently ignoring it would look like the setting did not save.
      if ((input.quietHoursFrom === null) !== (input.quietHoursTo === null)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Set both ends of quiet hours, or neither.",
        });
      }

      // A bad zone would make quiet hours silently never apply.
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone });
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown time zone" });
      }

      return ctx.db.notificationPreference.upsert({
        where: { userId: ctx.session.user.id },
        create: { userId: ctx.session.user.id, ...input },
        update: input,
      });
    }),
});
