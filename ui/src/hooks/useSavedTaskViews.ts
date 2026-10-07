import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedTaskView } from "@paperclipai/shared";
import { savedTaskViewsApi } from "../api/savedTaskViews";
import { queryKeys } from "../lib/queryKeys";
import { STARTER_SAVED_TASK_VIEWS, toSavedViewDefinition } from "../lib/saved-task-views";

/**
 * The signed-in user's saved views for one task collection.
 *
 * Server-held, not browser-held: a view saved on a phone has to be there on a
 * laptop, and has to survive clearing site data. There is no local mirror —
 * one copy means there is nothing to reconcile when two devices disagree.
 */
export function useSavedTaskViews(companyId: string | null | undefined, collectionKey: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.savedTaskViews.list(companyId ?? "__none__", collectionKey);

  const query = useQuery({
    queryKey,
    queryFn: () => savedTaskViewsApi.list(companyId!, collectionKey),
    enabled: !!companyId,
    // Views change only when this user changes them, so the list is refreshed
    // by the mutations below rather than by polling.
    staleTime: 60_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
    // queryKey is derived from the two arguments, so listing them is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, companyId, collectionKey]);

  const create = useMutation({
    mutationFn: (input: { name: string; viewState: Record<string, unknown> }) =>
      savedTaskViewsApi.create(companyId!, {
        collectionKey,
        name: input.name,
        viewState: toSavedViewDefinition(input.viewState),
      }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      name?: string;
      viewState?: Record<string, unknown>;
      position?: number;
    }) =>
      savedTaskViewsApi.update(companyId!, input.id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.viewState === undefined
          ? {}
          : { viewState: toSavedViewDefinition(input.viewState) }),
        ...(input.position === undefined ? {} : { position: input.position }),
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => savedTaskViewsApi.remove(companyId!, id),
    onSuccess: invalidate,
  });

  const addStarterViews = useMutation({
    mutationFn: async () => {
      const created: SavedTaskView[] = [];
      // Sequential, so `position` comes out in the listed order and a clash on
      // one name does not abandon the rest half-written.
      for (const [index, starter] of STARTER_SAVED_TASK_VIEWS.entries()) {
        created.push(
          await savedTaskViewsApi.create(companyId!, {
            collectionKey,
            name: starter.name,
            viewState: toSavedViewDefinition(starter.definition),
            position: index,
          }),
        );
      }
      return created;
    },
    onSuccess: invalidate,
  });

  const views = useMemo(() => query.data ?? [], [query.data]);

  return {
    views,
    isLoading: query.isLoading,
    /**
     * Saved views need a signed-in board user. With none (an agent token, a
     * company still loading) the menu shows built-in views only rather than
     * failing the page.
     */
    isAvailable: !!companyId && !query.isError,
    error: query.error as Error | null,
    create,
    update,
    remove,
    addStarterViews,
  };
}

export type UseSavedTaskViewsResult = ReturnType<typeof useSavedTaskViews>;
