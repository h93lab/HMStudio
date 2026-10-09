import {useState} from 'react';
import {Plus, X} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {api, type Template} from '@/lib/api';
import {Chips, errMsg, Pick, useLoad} from './common';

export const CATEGORIES: Template['category'][] = ['launch', 'explainer', 'offer', 'event', 'other'];
type Row = {type: string; seconds: number};

export const NewTemplateDialog: React.FC<{open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void}> = ({open, onOpenChange, onDone}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Template['category']>('launch');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'job' | 'manual'>('job');
  const [jobId, setJobId] = useState('');
  const [version, setVersion] = useState('');
  const [rows, setRows] = useState<Row[]>([{type: 'intro', seconds: 5}]);
  const [busy, setBusy] = useState(false);
  const jobs = useLoad(() => (open ? api.jobs() : Promise.resolve([])), [open]);
  const options = useLoad(() => (open ? api.options() : Promise.resolve(null)), [open]);

  const job = jobs.data?.find((j) => j.id === jobId);
  const sceneTypes = options.data?.sceneTypes ?? [];
  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? {...x, ...patch} : x)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return void toast.error('Name is required');
    if (mode === 'job' && (!job || !version)) return void toast.error('Pick a project and version');
    if (mode === 'manual' && (rows.length === 0 || rows.some((r) => !(r.seconds > 0)))) return void toast.error('Add scenes with a positive length');
    setBusy(true);
    try {
      await api.saveTemplate({name: name.trim(), category, description: description.trim(), ...(mode === 'job' ? {fromJob: jobId, v: Number(version)} : {scenes: rows})});
      toast.success('Template saved');
      onOpenChange(false);
      setName('');
      setDescription('');
      onDone();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>Save a scene structure the AI can reuse.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input id="tpl-name" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Pick id="tpl-category" label="Category" value={category} onChange={(v) => setCategory(v as Template['category'])} options={CATEGORIES.map((c) => ({value: c, label: c[0].toUpperCase() + c.slice(1)}))} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-desc">Description</Label>
            <Textarea id="tpl-desc" dir="auto" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Chips label="Structure source" value={mode} onChange={(v) => setMode(v as 'job' | 'manual')} items={[{value: 'job', label: 'Copy from a project'}, {value: 'manual', label: 'Build manually'}]} />
          {mode === 'job' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Pick id="tpl-job" label="Project" value={jobId} onChange={(v) => (setJobId(v), setVersion(''))} options={[{value: '', label: jobs.loading ? 'Loading…' : 'Choose…'}, ...(jobs.data ?? []).map((j) => ({value: j.id, label: `${j.clientName}: ${j.idea.slice(0, 40)}`}))]} />
              <Pick id="tpl-version" label="Version" value={version} onChange={setVersion} options={[{value: '', label: 'Choose…'}, ...(job?.versions ?? []).map((v) => ({value: String(v.v), label: `v${v.v} · ${v.scenes} scenes`}))]} />
              {jobs.error && <span className="text-xs text-destructive sm:col-span-2">{jobs.error}</span>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Pick id={`row-type-${i}`} label={`Scene ${i + 1} type`} value={r.type} onChange={(type) => setRow(i, {type})} options={(sceneTypes.length ? sceneTypes : [r.type]).map((t) => ({value: t, label: t}))} className="flex-1" />
                  <div className="flex w-24 flex-col gap-1.5">
                    <Label htmlFor={`row-sec-${i}`} className="text-xs text-muted-foreground">
                      Seconds
                    </Label>
                    <Input id={`row-sec-${i}`} type="number" min={1} max={60} value={r.seconds} onChange={(e) => setRow(i, {seconds: Number(e.target.value)})} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove scene ${i + 1}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-fit" disabled={rows.length >= 14} onClick={() => setRows((x) => [...x, {type: sceneTypes[0] ?? 'statement', seconds: 5}])}>
                <Plus /> Add scene
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" className="font-title" disabled={busy}>
              {busy ? 'Saving…' : 'Save template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
