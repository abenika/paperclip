import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import {
  createSavedTaskViewSchema,
  listSavedTaskViewsQuerySchema,
  updateSavedTaskViewSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { savedTaskViewService, SavedTaskViewNameTakenError } from "../services/saved-task-views.js";
import { assertCompanyAccess } from "./authz.js";

/**
 * Saved task views are personal: they belong to one signed-in board user, in
 * one company. Agents have no use for them, and no route exposes another
 * person's views, so every route requires a board user context.
 */
function requireBoardUserId(req: Request, res: Response): string | null {
  if (req.actor.type !== "board" || !req.actor.userId) {
    res.status(403).json({ error: "Board user context required" });
    return null;
  }
  return req.actor.userId;
}

export function savedTaskViewRoutes(db: Db) {
  const router = Router();
  const svc = savedTaskViewService(db);

  router.get("/companies/:companyId/saved-task-views", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const userId = requireBoardUserId(req, res);
    if (!userId) return;

    const query = listSavedTaskViewsQuerySchema.safeParse(req.query);
    if (!query.success) throw badRequest("Invalid saved task view query", query.error.issues);

    res.json(await svc.list({ companyId, userId }, query.data.collectionKey));
  });

  router.post(
    "/companies/:companyId/saved-task-views",
    validate(createSavedTaskViewSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const userId = requireBoardUserId(req, res);
      if (!userId) return;

      try {
        res.status(201).json(await svc.create({ companyId, userId }, req.body));
      } catch (error) {
        if (error instanceof SavedTaskViewNameTakenError) throw conflict(error.message);
        throw error;
      }
    },
  );

  router.patch(
    "/companies/:companyId/saved-task-views/:savedTaskViewId",
    validate(updateSavedTaskViewSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const userId = requireBoardUserId(req, res);
      if (!userId) return;

      try {
        const updated = await svc.update(
          { companyId, userId },
          req.params.savedTaskViewId as string,
          req.body,
        );
        if (!updated) throw notFound("Saved task view not found");
        res.json(updated);
      } catch (error) {
        if (error instanceof SavedTaskViewNameTakenError) throw conflict(error.message);
        throw error;
      }
    },
  );

  router.delete("/companies/:companyId/saved-task-views/:savedTaskViewId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const userId = requireBoardUserId(req, res);
    if (!userId) return;

    const removed = await svc.remove({ companyId, userId }, req.params.savedTaskViewId as string);
    if (!removed) throw notFound("Saved task view not found");
    res.status(204).end();
  });

  return router;
}
