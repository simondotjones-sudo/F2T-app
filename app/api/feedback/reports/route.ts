import type {NextRequest} from 'next/server';
import {feedbackReporter} from '@/lib/feedback';
import {feedbackReport,feedbackCsv} from '@/lib/feedback-report';
import {failed,json} from '@/lib/course-admin';
export async function GET(request:NextRequest){try{
 await feedbackReporter();const report=await feedbackReport(request.nextUrl.searchParams);
 return request.nextUrl.searchParams.get('format')==='csv'?new Response(feedbackCsv(report),{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment; filename="course-feedback.csv"','Cache-Control':'private, no-store'}}):json(report);
}catch(e){return failed(e);}}
