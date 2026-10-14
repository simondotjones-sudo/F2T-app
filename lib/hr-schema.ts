import {z} from 'zod';
export const hrDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Use a valid calendar date.');
export const hrEmployee=z.object({
 eventId:z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
 employeeId:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,49}$/),
 action:z.enum(['starter','update','leave','rehire']),effectiveDate:hrDate,
 reason:z.string().trim().min(3).max(500),
 name:z.string().trim().min(2).max(101).optional(),
 email:z.string().trim().toLowerCase().email().max(254).nullable().optional(),
 storeId:z.string().min(1).max(100).optional(),
 departmentId:z.string().min(1).max(100).nullable().optional(),
 jobRoleId:z.string().min(1).max(100).nullable().optional(),
 startDate:hrDate.optional(),
}).strict();
export type HrEmployee=z.infer<typeof hrEmployee>;
