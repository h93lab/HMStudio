import {useState} from 'react';
import {Globe} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {api, type Theme} from '@/lib/api';
import {DEFAULT_THEME, ID_RE} from './brand';
import {errMsg} from './common';

type DialogProps = {open: boolean; onOpenChange: (o: boolean) => void; onDone: (id: string) => void};

const IdField: React.FC<{value: string; onChange: (v: string) => void}> = ({value, onChange}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor="client-id">Client id</Label>
    <Input id="client-id" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} placeholder="nova-tech" aria-invalid={value !== '' && !ID_RE.test(value)} spellCheck={false} />
    <span className="text-xs text-muted-foreground">Lowercase letters, numbers and dashes.</span>
  </div>
);

export const DuplicateDialog: React.FC<DialogProps & {sourceId: string}> = ({open, onOpenChange, onDone, sourceId}) => {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ID_RE.test(id)) return void toast.error('Use lowercase letters, numbers and dashes for the id');
    setBusy(true);
    try {
      await api.duplicateClient(sourceId, id);
      toast.success(`Duplicated as ${id}`);
      onOpenChange(false);
      onDone(id);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Duplicate client</DialogTitle>
            <DialogDescription>Copy {sourceId} into a new profile.</DialogDescription>
          </DialogHeader>
          <IdField value={id} onChange={setId} />
          <DialogFooter>
            <Button type="submit" disabled={busy || !id}>
              {busy ? 'Duplicating…' : 'Duplicate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const NewClientDialog: React.FC<DialogProps> = ({open, onOpenChange, onDone}) => {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [brand, setBrand] = useState<{theme: Partial<Theme>; logo?: string} | null>(null);
  const [busy, setBusy] = useState(false);

  const importBrand = async () => {
    setBusy(true);
    try {
      const r = await api.brandFromUrl(url.trim());
      setBrand({theme: r.theme, logo: r.logo});
      toast.success('Brand imported. Review it after creating.');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ID_RE.test(id)) return void toast.error('Use lowercase letters, numbers and dashes for the id');
    if (!name.trim()) return void toast.error('Name is required');
    const base = DEFAULT_THEME(name.trim());
    const theme: Theme = {...base, ...brand?.theme, client: name.trim(), colors: {...base.colors, ...brand?.theme?.colors}, motion: {...base.motion, ...brand?.theme?.motion}, logo: brand?.logo ?? brand?.theme?.logo ?? ''};
    setBusy(true);
    try {
      await api.saveClient(id, {theme, defaults: url.trim() ? {url: url.trim()} : {}}, true);
      toast.success('Client created');
      onOpenChange(false);
      setId('');
      setName('');
      setUrl('');
      setBrand(null);
      onDone(id);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>Create a brand kit. Import colors and logo from a website to start faster.</DialogDescription>
          </DialogHeader>
          <IdField value={id} onChange={setId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-new-name">Name</Label>
            <Input id="client-new-name" dir="auto" placeholder="Nova Tech" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client-new-url">Website (optional)</Label>
            <div className="flex gap-2">
              <Input id="client-new-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
              <Button type="button" variant="outline" onClick={importBrand} disabled={busy || !/^https?:\/\//.test(url.trim())}>
                <Globe /> Import
              </Button>
            </div>
            {brand && <span className="text-xs text-primary">Brand imported from website.</span>}
          </div>
          <DialogFooter>
            <Button type="submit" className="font-title" disabled={busy || !id || !name.trim()}>
              {busy ? 'Working…' : 'Create client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
