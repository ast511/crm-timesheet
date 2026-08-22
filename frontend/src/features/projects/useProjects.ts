import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { PaginatedResult } from '@/api/client';
import type { DataTableState } from '@/components/data-table/data-table.types';

import {
  createProject,
  deleteProject,
  updateProject,
  type CreateProject,
  type Project,
  type UpdateProject,
} from './projects-api';
import { PROJECTS_QUERY_KEY, projectsQueryOptions } from './projects-query';

/**
 * The hooks the projects screen is built from.
 *
 * ## Where each kind of failure is reported, and why it differs
 *
 * The rule `useLeaveTypes.ts` states and the two hooks after it repeat, applied
 * unchanged: **a failure with an inline home is reported inline; toasts are for
 * successes and for failures with nowhere else to go.**
 *
 * So the two form mutations do not toast their errors. A rejected create or
 * update happens with the form still open and the person still looking at the
 * fields — a code that is already taken belongs beside the `Cod` input, and
 * `CLAUDE.md` is explicit that a validation failure is shown in the form rather
 * than as a toast. `ProjectForm` renders it through `useProjectErrorMessage`,
 * so the mutation deliberately stays quiet and the failure is reported once.
 *
 * The delete follows the same rule for a sharper reason here than anywhere
 * else: its `409` is the *expected* answer for a project people are on, and its
 * confirmation dialog stays open to say so rather than closing and leaving a
 * toast to explain a row that is still in the list.
 *
 * Successes *are* toasted here, once, for all three — the screen behind the
 * dialog is what the person sees next, and it needs to say what just happened.
 */

/**
 * One page of projects, for the current table state.
 *
 * `useSuspenseQuery`, as `CLAUDE.md` asks: the first load suspends into
 * `DataTableSkeleton` rather than branching on a loading flag, and a failure
 * throws to the surrounding `QueryBoundary`. Every subsequent page, sort,
 * search and filter is a *transition* (see `useDataTableTransition`), so the
 * rows already on screen stay there while the next page is fetched.
 */
export const useSuspenseProjects = (state: DataTableState): PaginatedResult<Project> => {
  const { data } = useSuspenseQuery(projectsQueryOptions(state));

  return data;
};

/**
 * Invalidates **every** cached page of the list.
 *
 * Not just the page the write happened on: a new project sorts into whichever
 * page its code falls on, a renamed one moves, a re-prioritised or archived one
 * leaves or joins whatever the filters are showing, and a deleted one shifts
 * every row after it up by one. Anything narrower would leave a neighbouring
 * page holding a list that is quietly one row out of date.
 */
const useInvalidateProjects = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
};

export const useCreateProject = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateProjects();

  return useMutation({
    mutationFn: (body: CreateProject) => createProject(body),
    onSuccess: async (project) => {
      await invalidate();
      toast.success(t('projects.toast.created', { name: project.name }));
    },
  });
};

export interface UpdateProjectVariables {
  id: string;
  body: UpdateProject;
}

export const useUpdateProject = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateProjects();

  return useMutation({
    mutationFn: ({ id, body }: UpdateProjectVariables) => updateProject(id, body),
    onSuccess: async (project) => {
      await invalidate();
      toast.success(t('projects.toast.updated', { name: project.name }));
    },
  });
};

export interface DeleteProjectVariables {
  id: string;
  /** Carried so the toast can name the row the response no longer describes. */
  name: string;
}

export const useDeleteProject = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateProjects();

  return useMutation({
    mutationFn: ({ id }: DeleteProjectVariables) => deleteProject(id),
    onSuccess: async (_data, { name }) => {
      await invalidate();
      toast.success(t('projects.toast.deleted', { name }));
    },
  });
};
