import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { userSavedTaskViews } from "@paperclipai/db";
import type { SavedTaskView } from "@paperclipai/shared";

export type SavedTaskViewOwner = {
  companyId: string;
  userId: string;
};

type SavedTaskViewRow = typeof userSavedTaskViews.$inferSelect;

export class SavedTaskViewNameTakenError extends Error {
  constructor(name: string) {
    super(`A view named "${name}" already exists in this collection`);
    this.name = "SavedTaskViewNameTakenError";
  }
}

function toSavedTaskView(row: SavedTaskViewRow): SavedTaskView {
  return {
    id: row.id,
    companyId: row.companyId,
    collectionKey: row.collectionKey,
    name: row.name,
    viewState: (row.viewState ?? {}) as Record<string, unknown>,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Postgres reports the unique-name clash as 23505. Driver versions differ on
// whether the constraint name comes back, so an unnamed 23505 on these two
// statements is treated as the name clash it can only be.
function isUniqueNameViolation(error: unknown): boolean {
  const candidate = error as { code?: string; constraint_name?: string; constraint?: string } | null;
  if (candidate?.code !== "23505") return false;
  const constraint = candidate.constraint_name ?? candidate.constraint ?? "";
  return constraint === "" || constraint.includes("user_saved_task_views_owner_name_uq");
}

export function savedTaskViewService(db: Db) {
  // Scoping every read and write by company *and* user is what keeps a saved
  // view private to the person who made it, including on update and delete.
  function ownerScope(owner: SavedTaskViewOwner) {
    return [
      eq(userSavedTaskViews.companyId, owner.companyId),
      eq(userSavedTaskViews.userId, owner.userId),
    ];
  }

  async function nextPosition(owner: SavedTaskViewOwner, collectionKey: string): Promise<number> {
    const [row] = await db
      .select({ maxPosition: sql<number | null>`max(${userSavedTaskViews.position})` })
      .from(userSavedTaskViews)
      .where(and(...ownerScope(owner), eq(userSavedTaskViews.collectionKey, collectionKey)));
    return (row?.maxPosition ?? -1) + 1;
  }

  return {
    async list(owner: SavedTaskViewOwner, collectionKey?: string): Promise<SavedTaskView[]> {
      const scope = ownerScope(owner);
      if (collectionKey) scope.push(eq(userSavedTaskViews.collectionKey, collectionKey));

      const rows = await db
        .select()
        .from(userSavedTaskViews)
        .where(and(...scope))
        .orderBy(asc(userSavedTaskViews.position), asc(userSavedTaskViews.createdAt));
      return rows.map(toSavedTaskView);
    },

    async create(
      owner: SavedTaskViewOwner,
      input: {
        collectionKey: string;
        name: string;
        viewState: Record<string, unknown>;
        position?: number;
      },
    ): Promise<SavedTaskView> {
      // New views land at the end of the owner's list for this collection
      // unless the caller places them explicitly.
      const position = input.position ?? await nextPosition(owner, input.collectionKey);
      try {
        const [row] = await db
          .insert(userSavedTaskViews)
          .values({
            companyId: owner.companyId,
            userId: owner.userId,
            collectionKey: input.collectionKey,
            name: input.name,
            viewState: input.viewState,
            position,
          })
          .returning();
        return toSavedTaskView(row!);
      } catch (error) {
        if (isUniqueNameViolation(error)) throw new SavedTaskViewNameTakenError(input.name);
        throw error;
      }
    },

    async update(
      owner: SavedTaskViewOwner,
      savedTaskViewId: string,
      patch: { name?: string; viewState?: Record<string, unknown>; position?: number },
    ): Promise<SavedTaskView | null> {
      try {
        const [row] = await db
          .update(userSavedTaskViews)
          .set({
            ...(patch.name === undefined ? {} : { name: patch.name }),
            ...(patch.viewState === undefined ? {} : { viewState: patch.viewState }),
            ...(patch.position === undefined ? {} : { position: patch.position }),
            updatedAt: new Date(),
          })
          .where(and(eq(userSavedTaskViews.id, savedTaskViewId), ...ownerScope(owner)))
          .returning();
        return row ? toSavedTaskView(row) : null;
      } catch (error) {
        if (patch.name !== undefined && isUniqueNameViolation(error)) {
          throw new SavedTaskViewNameTakenError(patch.name);
        }
        throw error;
      }
    },

    async remove(owner: SavedTaskViewOwner, savedTaskViewId: string): Promise<boolean> {
      const deleted = await db
        .delete(userSavedTaskViews)
        .where(and(eq(userSavedTaskViews.id, savedTaskViewId), ...ownerScope(owner)))
        .returning({ id: userSavedTaskViews.id });
      return deleted.length > 0;
    },
  };
}
