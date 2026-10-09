import {createRoot} from 'react-dom/client';
import {App} from './App';
import './styles.css';

// URL: /edit/<jobId>
const jobId = decodeURIComponent(location.pathname.replace(/^\/edit\/?/, '').split('/')[0] ?? '');
createRoot(document.getElementById('root')!).render(jobId ? <App jobId={jobId} /> : <div className="empty">Open a job from the dashboard (/edit/&lt;job-id&gt;).</div>);
