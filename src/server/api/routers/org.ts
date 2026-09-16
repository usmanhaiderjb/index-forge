import { Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { slugify } from "@aso/shared";
import { generateApiKey } from "@/server/crypto";
import {
  adminProcedure,
  createTRPCRouter,
  hasRole,
  orgProcedure,
  ownerProcedure,
  protectedProcedure,
} from "@/server/api/trpc";

export const orgRouter = createTRPCRouter({
  /** Everything the app shell needs on first paint. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.membership.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, imageUrl: true, plan: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      user: ctx.session.user,
      organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  }),

  current: orgProcedure.query(async ({ ctx }) => {
    const organization = await ctx.db.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      include: { _count: { select: { apps: true, connections: true, memberships: true } } },
    });
    return { ...organization, role: ctx.role };
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const base = slugify(input.name);
      let slug = base;
      for (let i = 1; await ctx.db.organization.findUnique({ where: { slug } }); i++) {
        slug = `${base}-${i}`;
      }

      return ctx.db.organization.create({
        data: {
          name: input.name,
          slug,
          memberships: { create: { userId: ctx.session.user.id, role: "OWNER" } },
        },
      });
    }),

  update: adminProcedure
    .input(z.object({ name: z.string().min(1).max(80).optional(), imageUrl: z.string().url().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.organization.update({ where: { id: ctx.organizationId }, data: input });
    }),

  members: orgProcedure.query(async ({ ctx }) => {
    const [members, invites] = await Promise.all([
      ctx.db.membership.findMany({
        where: { organizationId: ctx.organizationId },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { createdAt: "asc" },
      }),
      ctx.db.invite.findMany({
        where: { organizationId: ctx.organizationId, acceptedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { members, invites };
  }),

  invite: adminProcedure
    .input(z.object({ email: z.string().email(), role: z.nativeEnum(Role).default("MEMBER") }))
    .mutation(async ({ ctx, input }) => {
      if (input.role === "OWNER" && ctx.role !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can invite another owner" });
      }

      const existing = await ctx.db.membership.findFirst({
        where: { organizationId: ctx.organizationId, user: { email: input.email } },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "That person is already a member" });
      }

      const invite = await ctx.db.invite.upsert({
        where: {
          organizationId_email: { organizationId: ctx.organizationId, email: input.email },
        },
        create: {
          organizationId: ctx.organizationId,
          email: input.email,
          role: input.role,
          token: randomBytes(24).toString("base64url"),
          invitedById: ctx.session.user.id,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
        update: {
          role: input.role,
          token: randomBytes(24).toString("base64url"),
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });

      // The invite is redeemed on first sign-in with a matching email; there is
      // no mail transport wired up on this deployment, so the link is returned
      // for the admin to pass along.
      return { invite, acceptUrl: `/invite/${invite.token}` };
    }),

  revokeInvite: adminProcedure
    .input(z.object({ inviteId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.invite.findFirst({
        where: { id: input.inviteId, organizationId: ctx.organizationId },
      });
      if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.invite.delete({ where: { id: input.inviteId } });
      return { ok: true };
    }),

  setRole: adminProcedure
    .input(z.object({ userId: z.string().cuid(), role: z.nativeEnum(Role) }))
    .mutation(async ({ ctx, input }) => {
      if (!hasRole(ctx.role, input.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot grant a role above your own",
        });
      }

      const target = await ctx.db.membership.findUnique({
        where: { userId_organizationId: { userId: input.userId, organizationId: ctx.organizationId } },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      // The last owner cannot be demoted, or the org becomes unadministrable.
      if (target.role === "OWNER" && input.role !== "OWNER") {
        const owners = await ctx.db.membership.count({
          where: { organizationId: ctx.organizationId, role: "OWNER" },
        });
        if (owners <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "An organization must keep at least one owner",
          });
        }
      }

      return ctx.db.membership.update({
        where: { userId_organizationId: { userId: input.userId, organizationId: ctx.organizationId } },
        data: { role: input.role },
      });
    }),

  removeMember: adminProcedure
    .input(z.object({ userId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.membership.findUnique({
        where: { userId_organizationId: { userId: input.userId, organizationId: ctx.organizationId } },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      if (target.role === "OWNER") {
        const owners = await ctx.db.membership.count({
          where: { organizationId: ctx.organizationId, role: "OWNER" },
        });
        if (owners <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove the last owner" });
        }
      }

      await ctx.db.membership.delete({
        where: { userId_organizationId: { userId: input.userId, organizationId: ctx.organizationId } },
      });
      return { ok: true };
    }),

  apiKeys: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.apiKey.findMany({
      where: { organizationId: ctx.organizationId, revokedAt: null },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }),

  createApiKey: adminProcedure
    .input(z.object({ name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const { plaintext, hashed, prefix } = generateApiKey();

      await ctx.db.apiKey.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          hashedKey: hashed,
          prefix,
        },
      });

      // Shown once. Only the hash is stored.
      return { key: plaintext };
    }),

  revokeApiKey: adminProcedure
    .input(z.object({ keyId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.keyId, organizationId: ctx.organizationId },
      });
      if (!key) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.apiKey.update({
        where: { id: input.keyId },
        data: { revokedAt: new Date() },
      });
      return { ok: true };
    }),

  auditLog: adminProcedure
    .input(z.object({ limit: z.number().int().max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.auditLog.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: { actor: { select: { name: true, email: true } } },
      });
    }),

  delete: ownerProcedure
    .input(z.object({ confirmSlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const organization = await ctx.db.organization.findUniqueOrThrow({
        where: { id: ctx.organizationId },
      });
      if (input.confirmSlug !== organization.slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Type the organization slug exactly to confirm",
        });
      }
      await ctx.db.organization.delete({ where: { id: ctx.organizationId } });
      return { ok: true };
    }),
});
