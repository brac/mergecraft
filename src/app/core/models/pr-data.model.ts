export interface PrAuthor {
  login: string;
  type: 'User' | 'Bot';
}

export interface ReviewComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  path?: string;
  line?: number;
}

export interface Review {
  id: number;
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  body: string;
  submittedAt: string;
}

export interface PrFileChange {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
}

export interface PrData {
  number: number;
  title: string;
  body: string;
  author: PrAuthor;
  url: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PrFileChange[];
  reviews: Review[];
  reviewComments: ReviewComment[];
  issueComments: ReviewComment[];
  labels: string[];
  diff?: string;
}
