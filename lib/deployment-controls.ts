import {runtimeEnv} from './runtime-env';
import {migrationHoldEnabled} from './migration-hold';
import deployContext from './deploy-context.json' with {type: 'json'};

// A new installation must never start scheduled processing by inheriting data.
// Enable only after its independent database and file copy have been validated.
export function backgroundJobsEnabled() {
  return !migrationHoldEnabled() && runtimeEnv('LMS_BACKGROUND_JOBS') === 'enabled'
    && (runtimeEnv('CONTEXT') || deployContext.context) === 'production';
}
