// Shared by HTTP handlers and background workflows without importing Next.js routes.
export class CourseError extends Error { constructor(message:string,public status=400){super(message);} }
