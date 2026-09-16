import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

/**
 * Account deletion.
 *
 * Apple requires any app offering account creation to offer in-app deletion
 * (App Review guideline 5.1.1(v)), and it has to actually delete rather than
 * deactivate. This is also the honest behaviour regardless of the rule.
 *
 * The hard part is not the delete, it is what happens to the organizations the
 * user belongs to. Three cases, handled differently:
 *
 *   sole member          the organization goes with them
 *   sole owner, others   blocked — transferring ownership is a decision only
 *                        the user can make, and silently promoting someone or
 *                        orphaning a workspace are both worse
 *   ordinary member      only their membership is removed
 */
export const accountRouter = createTRPCRouter({
  /**
   * What deleting would actually do, and what stands in the way.
   *
   * Shown before the confirmation, not after it fails: a destructive action
   * should say what it destroys while there is still time to reconsider.
   */
  deletionImpact: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.membership.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        organization: {
          include: {
            _count: { select: { memberships: true, apps: true } },
          },
        },
      },
    });

    const organizations = await Promise.all(
      memberships.map(async (membership) => {
        const otherOwners = await ctx.db.membership.count({
          where: {
            organizationId: membership.organizationId,
            role: "OWNER",
            userId: { not: ctx.session.user.id },
          },
        });

        const otherMembers = membership.organization._count.memberships - 1;
        const isSoleOwner = membership.role === "OWNER" && otherOwners === 0;

        return {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          role: membership.role,
          apps: membership.organization._count.apps,
          otherMembers,
          // Deleted outright when nobody else is in it.
          willBeDeleted: otherMembers === 0,
          // Blocks the whole operation until ownership moves.
          blocks: isSoleOwner && otherMembers > 0,
        };
      }),
    );

    const blockers = organizations.filter((org) => org.blocks);

    return {
      email: ctx.session.user.email,
      organizations,
      canDelete: blockers.length === 0,
      blockers: blockers.map((org) => ({
        id: org.id,
        name: org.name,
        reason: `You are the only owner of ${org.name}, which has ${org.otherMembers} other member${
          org.otherMembers === 1 ? "" : "s"
        }. Make someone else an owner first, or delete the workspace.`,
      })),
      /** What survives, so nothing here is a surprise afterwards. */
      retained: [
        "Audit log entries in workspaces you leave, with your name removed",
        "Invitations you sent, with your name removed",
      ],
    };
  }),

  /**
   * Deletes the account.
   *
   * Immediate and irreversible. No soft-delete flag: an account that still
   * exists in the database after the user asked for it to be gone is not
   * deleted, whatever the column says.
   */
  delete: protectedProcedure
    .input(
      z.object({
        // Typing the address is the confirmation. A checkbox is too easy to
        // hit by accident for something with no undo.
        confirmEmail: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true },
      });

      if (input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Type your email address exactly to confirm",
        });
      }

      const memberships = await ctx.db.membership.findMany({
        where: { userId },
        select: { organizationId: true, role: true },
      });

      // Re-checked here rather than trusting the impact query — that ran at
      // some earlier moment, and a workspace can gain a member in between.
      for (const membership of memberships) {
        const [otherOwners, otherMembers] = await Promise.all([
          ctx.db.membership.count({
            where: {
              organizationId: membership.organizationId,
              role: "OWNER",
              userId: { not: userId },
            },
          }),
          ctx.db.membership.count({
            where: { organizationId: membership.organizationId, userId: { not: userId } },
          }),
        ]);

        if (membership.role === "OWNER" && otherOwners === 0 && otherMembers > 0) {
          const organization = await ctx.db.organization.findUniqueOrThrow({
            where: { id: membership.organizationId },
            select: { name: true },
          });

          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `You are the only owner of ${organization.name}. Make someone else an owner, or delete that workspace, before deleting your account.`,
          });
        }
      }

      const orphaned: string[] = [];

      for (const membership of memberships) {
        const otherMembers = await ctx.db.membership.count({
          where: { organizationId: membership.organizationId, userId: { not: userId } },
        });
        if (otherMembers === 0) orphaned.push(membership.organizationId);
      }

      // Order matters. Organizations first: deleting the user first would
      // cascade their memberships away, and the "is anyone left" check above
      // would no longer match what is on disk.
      await ctx.db.$transaction(async (tx) => {
        for (const organizationId of orphaned) {
          await tx.organization.delete({ where: { id: organizationId } });
        }

        // Device sessions, push tokens, preferences, memberships, OAuth
        // accounts and web sessions all cascade from the user. Audit entries
        // and sent invitations null their actor instead, so a workspace someone
        // else still uses keeps its history intact.
        await tx.user.delete({ where: { id: userId } });
      });

      return {
        ok: true as const,
        organizationsDeleted: orphaned.length,
      };
    }),
});
