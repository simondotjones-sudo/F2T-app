import type {Config, Context} from '@netlify/edge-functions';
import {migrationHoldEnabled, migrationHoldResponse} from './migration-hold';

export default (request: Request, _context: Context) => {
  if (migrationHoldEnabled()) return migrationHoldResponse(request);
};

// Application routes must stop before handlers can synchronise assignments.
// Public build assets contain no imported learner data and need no invocation.
export const config: Config = {
  path:'/*',
  excludedPath:['/_next/static/*','/fonts/*','/course-images/*','/lesson-covers/*','/videos/*'],
  onError:'fail',
};
