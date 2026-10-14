import {getDatabase} from '@netlify/database';
import {assertMigrationOpen} from './migration-hold';
let driver:ReturnType<typeof getDatabase>|undefined;
export function databaseDriver(){assertMigrationOpen();return driver??=getDatabase();}
