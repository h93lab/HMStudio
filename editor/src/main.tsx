import {createRoot} from 'react-dom/client';
import {Toaster} from '@/components/ui/sonner';
import {TooltipProvider} from '@/components/ui/tooltip';
import {match, useLocation} from '@/lib/router';
import {AssetsPage} from './pages/Assets';
import {ClientsPage} from './pages/Clients';
import {ComparePage} from './pages/Compare';
import {CreatePage} from './pages/Create';
import {EditorPage} from './pages/Editor';
import {ProjectsPage} from './pages/Projects';
import {QueuePage} from './pages/Queue';
import {ReviewPage} from './pages/Review';
import {LoginPage} from './pages/Login';
import {SettingsPage} from './pages/Settings';
import {StylesPage} from './pages/Styles';
import {TemplatesPage} from './pages/Templates';
import './index.css';

const ROUTES: [string, React.FC<{params: Record<string, string>}>][] = [
  ['/', ProjectsPage],
  ['/new', CreatePage],
  ['/new/:run', CreatePage], // progress of a started run
  ['/edit/:id', EditorPage],
  ['/compare/:id', ComparePage],
  ['/clients', ClientsPage],
  ['/clients/:id', ClientsPage],
  ['/assets', AssetsPage],
  ['/templates', TemplatesPage],
  ['/styles', StylesPage],
  ['/styles/:id', StylesPage],
  ['/queue', QueuePage],
  ['/settings', SettingsPage],
  ['/review/:id', ReviewPage],
  ['/login', LoginPage],
];

const App = () => {
  const {path} = useLocation();
  for (const [pattern, Page] of ROUTES) {
    const params = match(pattern, path);
    if (params) return <Page key={pattern + JSON.stringify(params)} params={params} />;
  }
  return <ProjectsPage params={{}} />;
};

createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <App />
    <Toaster position="bottom-right" />
  </TooltipProvider>,
);
