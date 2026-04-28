import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { PrAuthor, PrData, PrFileChange, Review, ReviewComment } from '../models/pr-data.model';
import { SettingsService } from './settings.service';

const GITHUB_API_BASE = 'https://api.github.com';

interface GhUser {
  login: string;
  type: string;
}

interface GhPullListItem {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  html_url: string;
  user: GhUser | null;
  labels: { name: string }[];
}

interface GhReview {
  id: number;
  user: GhUser | null;
  body: string | null;
  state: string;
  submitted_at: string | null;
}

interface GhReviewComment {
  id: number;
  user: GhUser | null;
  body: string;
  created_at: string;
  path?: string;
  line?: number | null;
}

interface GhPullFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

export interface FetchPrDetailsOptions {
  includeFiles?: boolean;
  includeDiff?: boolean;
}

const DIFF_SKIP_CHANGED_FILES_THRESHOLD = 30;
const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 5;

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class GitHubService {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);

  listMergedPrs(owner: string, repo: string, maxCount = 100): Observable<PrData[]> {
    return this.fetchMergedPage(owner, repo, maxCount, 1, []).pipe(
      catchError((err) => this.mapError(err)),
    );
  }

  private fetchMergedPage(
    owner: string,
    repo: string,
    maxCount: number,
    page: number,
    accumulated: PrData[],
  ): Observable<PrData[]> {
    const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/pulls?state=closed&per_page=${LIST_PAGE_SIZE}&page=${page}&sort=updated&direction=desc`;

    return this.http.get<GhPullListItem[]>(url, { headers: this.headers() }).pipe(
      switchMap((items) => {
        const merged = items
          .filter((item) => item.merged_at !== null)
          .map((item) => this.mapListItemToPrData(item));
        const combined = [...accumulated, ...merged];
        const reachedCap = combined.length >= maxCount;
        const lastPage = items.length < LIST_PAGE_SIZE;
        const hitPageLimit = page >= LIST_MAX_PAGES;
        if (reachedCap || lastPage || hitPageLimit) {
          return of(combined.slice(0, maxCount));
        }
        return this.fetchMergedPage(owner, repo, maxCount, page + 1, combined);
      }),
    );
  }

  fetchPrDetails(
    owner: string,
    repo: string,
    prNumber: number,
    options: FetchPrDetailsOptions = {},
  ): Observable<PrData> {
    const base = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/pulls/${prNumber}`;
    const headers = this.headers();

    const diffHeaders = this.headers().set('Accept', 'application/vnd.github.diff');

    const requests = {
      pr: this.http.get<
        GhPullListItem & {
          additions: number;
          deletions: number;
          changed_files: number;
        }
      >(base, { headers }),
      reviews: this.http.get<GhReview[]>(`${base}/reviews?per_page=100`, { headers }),
      reviewComments: this.http.get<GhReviewComment[]>(`${base}/comments?per_page=100`, {
        headers,
      }),
      files: options.includeFiles
        ? this.http.get<GhPullFile[]>(`${base}/files?per_page=100`, { headers })
        : of<GhPullFile[]>([]),
      diff: options.includeDiff
        ? this.http
            .get(base, { headers: diffHeaders, responseType: 'text' })
            .pipe(catchError(() => of('')))
        : of<string>(''),
    };

    return forkJoin(requests).pipe(
      map(({ pr, reviews, reviewComments, files, diff }) => {
        const baseData = this.mapListItemToPrData(pr);
        const keepDiff =
          options.includeDiff &&
          diff.length > 0 &&
          pr.changed_files <= DIFF_SKIP_CHANGED_FILES_THRESHOLD;
        return {
          ...baseData,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          reviews: reviews.map((r) => this.mapReview(r)),
          reviewComments: reviewComments.map((c) => this.mapReviewComment(c)),
          files: files.map((f) => this.mapFile(f)),
          diff: keepDiff ? diff : undefined,
        };
      }),
      catchError((err) => this.mapError(err)),
    );
  }

  private mapFile(file: GhPullFile): PrFileChange {
    const allowedStatuses = [
      'added',
      'modified',
      'removed',
      'renamed',
      'copied',
      'changed',
      'unchanged',
    ] as const;
    const status = (allowedStatuses as readonly string[]).includes(file.status)
      ? (file.status as (typeof allowedStatuses)[number])
      : 'modified';
    return {
      filename: file.filename,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      status,
    };
  }

  private mapListItemToPrData(item: GhPullListItem): PrData {
    const author: PrAuthor = {
      login: item.user?.login ?? 'unknown',
      type: item.user?.type === 'Bot' ? 'Bot' : 'User',
    };
    return {
      number: item.number,
      title: item.title,
      body: item.body ?? '',
      author,
      url: item.html_url,
      state: item.merged_at ? 'merged' : item.state,
      createdAt: item.created_at,
      mergedAt: item.merged_at,
      closedAt: item.closed_at,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      files: [],
      reviews: [],
      reviewComments: [],
      issueComments: [],
      labels: item.labels.map((l) => l.name),
    };
  }

  private mapReview(review: GhReview): Review {
    const allowedStates = [
      'APPROVED',
      'CHANGES_REQUESTED',
      'COMMENTED',
      'DISMISSED',
      'PENDING',
    ] as const;
    const state = (allowedStates as readonly string[]).includes(review.state)
      ? (review.state as Review['state'])
      : 'COMMENTED';
    return {
      id: review.id,
      author: review.user?.login ?? 'unknown',
      state,
      body: review.body ?? '',
      submittedAt: review.submitted_at ?? '',
    };
  }

  private mapReviewComment(comment: GhReviewComment): ReviewComment {
    return {
      id: comment.id,
      author: comment.user?.login ?? 'unknown',
      body: comment.body,
      createdAt: comment.created_at,
      path: comment.path,
      line: comment.line ?? undefined,
    };
  }

  private headers(): HttpHeaders {
    const pat = this.settings.getGithubPat();
    let headers = new HttpHeaders({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
    if (pat) {
      headers = headers.set('Authorization', `Bearer ${pat}`);
    }
    return headers;
  }

  private mapError(err: unknown): Observable<never> {
    if (err instanceof GitHubApiError) {
      return throwError(() => err);
    }
    console.error('GitHub API error', err);
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return throwError(
          () => new GitHubApiError('Invalid GitHub PAT — check your settings', 401),
        );
      }
      if (err.status === 404) {
        return throwError(
          () => new GitHubApiError('Repository not found — check the owner/repo format', 404),
        );
      }
      return throwError(
        () => new GitHubApiError('Something went wrong — check the console', err.status),
      );
    }
    return throwError(() => new GitHubApiError('Something went wrong — check the console', 0));
  }
}
