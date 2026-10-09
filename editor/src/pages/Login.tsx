import {useEffect, useRef, useState} from 'react';
import {Loader2, Play} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {Panel} from '@/components/kit';
import {Input} from '@/components/ui/input';
import {api, ApiError, type AuthState} from '@/lib/api';
import {navigate, useLocation} from '@/lib/router';

const LEN = 6;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Six single-digit boxes. Auto-submits via onComplete; the PIN lives only in this component's state.
const PinBoxes: React.FC<{label: string; disabled: boolean; invalid: boolean; resetKey: number; onComplete: (pin: string) => void}> = ({label, disabled, invalid, resetKey, onComplete}) => {
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const group = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (invalid) group.current?.animate?.([{transform: 'translateX(0)'}, {transform: 'translateX(-8px)'}, {transform: 'translateX(8px)'}, {transform: 'translateX(-4px)'}, {transform: 'translateX(0)'}], {duration: 350});
  }, [invalid, resetKey]);

  useEffect(() => {
    setDigits(Array(LEN).fill(''));
    refs.current[0]?.focus();
  }, [resetKey]);

  const commit = (next: string[]) => {
    setDigits(next);
    if (next.every(Boolean)) onComplete(next.join(''));
  };
  const fill = (from: number, text: string) => {
    const chars = text.replace(/\D/g, '').slice(0, LEN - from).split('');
    if (!chars.length) return;
    const next = [...digits];
    chars.forEach((c, i) => (next[from + i] = c));
    refs.current[Math.min(from + chars.length, LEN - 1)]?.focus();
    commit(next);
  };

  return (
    <div ref={group} role="group" aria-label={label} className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <Input
          key={i}
          ref={(el) => void (refs.current[i] = el)}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LEN}
          aria-label={`Digit ${i + 1} of ${LEN}`}
          aria-invalid={invalid}
          type="password"
          className="h-12 w-11 px-0 text-center text-xl font-semibold sm:w-12"
          onFocus={(e) => e.target.select()}
          onChange={(e) => fill(i, e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            fill(0, e.clipboardData.getData('text'));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) {
              e.preventDefault();
              const next = [...digits];
              next[i - 1] = '';
              setDigits(next);
              refs.current[i - 1]?.focus();
            }
          }}
        />
      ))}
    </div>
  );
};

export const LoginPage: React.FC<{params: Record<string, string>}> = () => {
  const {query} = useLocation();
  const raw = query.get('next');
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : '/';
  const [state, setState] = useState<AuthState>();
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);
  const [first, setFirst] = useState<string>(); // PIN typed in step 1 of "Set your PIN"

  useEffect(() => {
    api.auth().then(
      (s) => (s.authenticated ? navigate(next, true) : setState(s)),
      (e) => setLoadError(errText(e)),
    );
  }, [next]);

  const fail = (msg: string) => {
    setError(msg);
    setReset((r) => r + 1);
  };

  const login = async (pin: string) => {
    setBusy(true);
    setError('');
    try {
      await api.login(pin);
      navigate(next, true);
    } catch (e) {
      fail(e instanceof ApiError && e.status === 401 ? 'Wrong PIN' : errText(e));
    }
    setBusy(false);
  };

  const setup = async (pin: string) => {
    if (!first) {
      setFirst(pin);
      setError('');
      setReset((r) => r + 1);
      return;
    }
    if (pin !== first) {
      setFirst(undefined);
      return fail('The PINs did not match. Start again.');
    }
    setBusy(true);
    try {
      await api.setPin(pin);
      toast.success('PIN set');
      navigate(next, true);
    } catch (e) {
      setFirst(undefined);
      fail(errText(e));
    }
    setBusy(false);
  };

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <p role="alert" className="text-center text-sm text-destructive">
        Could not reach the server: {loadError}
      </p>
    );
  } else if (!state) {
    body = <Loader2 className="mx-auto animate-spin text-muted-foreground" aria-label="Loading" />;
  } else if (!state.pinSet && !state.canSetPin) {
    body = <p className="text-center text-sm text-muted-foreground">Set the PIN on the Mac running Motion Studio first (open http://localhost:4777).</p>;
  } else {
    const setting = !state.pinSet;
    body = (
      <>
        <div className="text-center">
          <h1 className="font-title text-xl">{setting ? 'Set your PIN' : 'Enter your PIN'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{setting ? (first ? 'Type it again to confirm.' : 'Choose 6 digits. You will use it to sign in from other devices.') : '6-digit PIN'}</p>
        </div>
        <PinBoxes label={setting ? (first ? 'Confirm PIN' : 'New PIN') : 'PIN'} disabled={busy} invalid={!!error} resetKey={reset} onComplete={(p) => void (setting ? setup(p) : login(p))} />
        <p role="alert" className="min-h-5 text-center text-sm text-destructive">
          {error}
        </p>
        {busy && <Loader2 className="mx-auto animate-spin text-muted-foreground" aria-label="Signing in" />}
      </>
    );
  }

  return (
    <main className="grid min-h-full place-items-center p-4">
      <Panel as="div" className="w-full max-w-sm gap-5">
        <div className="flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Play className="size-4 fill-current" />
          </span>
          <span className="font-title text-xl">Motion Studio</span>
        </div>
        {body}
      </Panel>
    </main>
  );
};
