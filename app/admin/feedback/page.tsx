import {redirect} from 'next/navigation';
import {feedbackReporter} from '@/lib/feedback';
import FeedbackAdmin from './feedback-admin';
import FeaturePage from '@/components/feature-page';
import '../../feedback/feedback.css';
import '../../live-training/live-training.css';
export default async function Page(){try{await feedbackReporter();}catch{redirect('/?featureUnavailable=1');}return <FeaturePage feature="course_feedback"><FeedbackAdmin/></FeaturePage>;}
