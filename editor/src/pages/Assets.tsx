import {useRef, useState} from 'react';
import {Upload} from 'lucide-react';
import {toast} from 'sonner';
import {AppShell, PageTitle} from '@/components/AppShell';
import {AssetCard} from '@/components/library/AssetCard';
import {EmptyState, ErrorBox, FilterTabs, PageBody, SelectField} from '@/components/kit';
import {errMsg, useLoad} from '@/components/library/common';
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle} from '@/components/ui/alert-dialog';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Skeleton} from '@/components/ui/skeleton';
import {api, type Asset} from '@/lib/api';
import {navigate, useLocation} from '@/lib/router';
import {cn} from '@/lib/utils';

const MAX_BYTES = 200 * 1024 * 1024;
const TABS = [
  {value: 'all', label: 'All'},
  {value: 'logo', label: 'Logos'},
  {value: 'screenshot', label: 'Screenshots'},
  {value: 'clip', label: 'Clips'},
  {value: 'music', label: 'Music'},
];
const matchesTab = (a: Asset, tab: string) => tab === 'all' || a.kind === tab || (tab === 'screenshot' && a.kind === 'image');

export const AssetsPage: React.FC<{params: Record<string, string>}> = () => {
  const {query} = useLocation();
  const client = query.get('client') ?? '';
  const clients = useLoad(() => api.clients(), []);
  const assets = useLoad(() => api.assets(client || undefined), [client]);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Asset | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const setClient = (id: string) => navigate(id ? `/assets?client=${encodeURIComponent(id)}` : '/assets', true);

  const upload = async (files: File[]) => {
    if (!client) return void toast.error('Pick a client before uploading');
    for (const [i, file] of files.entries()) {
      const label = `${file.name} (${i + 1}/${files.length})`;
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is over 200 MB`);
        continue;
      }
      setProgress(`Uploading ${label}`);
      const t = toast.loading(`Uploading ${file.name}`);
      try {
        await api.uploadAsset(client, file);
        toast.success(`Uploaded ${file.name}`, {id: t});
      } catch (e) {
        toast.error(`${file.name}: ${errMsg(e)}`, {id: t});
      }
    }
    setProgress(null);
    assets.reload();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deleteAsset(toDelete.client || client, toDelete.name);
      toast.success('Asset deleted');
      assets.reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
    setToDelete(null);
  };

  const dropProps = {
    onDragOver: (e: React.DragEvent) => (e.preventDefault(), setDrag(true)),
    onDragLeave: () => setDrag(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      void upload([...e.dataTransfer.files]);
    },
  };
  const chooseBtn = (variant: 'default' | 'outline') => (
    <Button variant={variant} className={variant === 'default' ? 'font-title' : undefined} disabled={!client || progress !== null} onClick={() => input.current?.click()}>
      Choose files
    </Button>
  );
  const hasAssets = !!assets.data?.length;

  const q = search.trim().toLowerCase();
  const shown = (assets.data ?? []).filter((a) => matchesTab(a, tab) && (!q || a.name.toLowerCase().includes(q)));
  const options = [{value: '', label: 'All clients'}, ...(clients.data ?? []).map((c) => ({value: c.id, label: c.theme.client || c.id}))];
  if (client && !options.some((o) => o.value === client)) options.push({value: client, label: client});

  return (
    <AppShell>
      <PageBody>
        <PageTitle title="Asset library">
          <SelectField id="asset-client" value={client} onChange={setClient} options={options} className="w-full sm:w-48" />
          <FilterTabs label="Asset type" value={tab} onChange={setTab} items={TABS} />
          <div className="w-full sm:w-52">
            <Label htmlFor="asset-search" className="sr-only">
              Search assets
            </Label>
            <Input id="asset-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets" dir="auto" />
          </div>
        </PageTitle>

        <input ref={input} type="file" multiple hidden aria-label="Upload files" accept="image/*,video/*,audio/*" onChange={(e) => (void upload([...(e.target.files ?? [])]), (e.target.value = ''))} />
        {hasAssets && (
          <div {...dropProps} className={cn('flex flex-wrap items-center justify-center gap-3 rounded-xl border border-dashed bg-field px-4 py-3 text-sm text-muted-foreground', drag && 'border-primary bg-primary/5 text-foreground')}>
            <Upload className="size-4" aria-hidden />
            <span>{progress ?? (client ? 'Drop files here · up to 200 MB' : 'Pick a client to upload assets')}</span>
            {chooseBtn('outline')}
          </div>
        )}

        {assets.error && <ErrorBox message={assets.error} onRetry={assets.reload} />}
        {assets.loading && !assets.data ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {Array.from({length: 8}, (_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : !hasAssets ? (
          !assets.error && (
            <EmptyState
              {...dropProps}
              className={cn(drag && 'border-primary bg-primary/5')}
              icon={<Upload />}
              title="No assets yet"
              text={progress ?? (client ? 'Drop logos, screenshots, clips or music here · up to 200 MB' : 'Pick a client to upload assets')}
              action={chooseBtn('default')}
            />
          )
        ) : shown.length === 0 ? (
          <EmptyState title="No assets match this filter" />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {shown.map((a) => (
              <AssetCard key={`${a.client}/${a.name}`} asset={a} showClient={!client} onDelete={setToDelete} />
            ))}
          </div>
        )}
      </PageBody>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
            <AlertDialogDescription dir="auto">{toDelete?.name} will be removed from the library. Videos already rendered are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
};
