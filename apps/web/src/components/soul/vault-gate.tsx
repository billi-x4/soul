"use client";

import { MIN_VAULT_PASSPHRASE_CHARS, type VaultStatus } from "@soul/shared";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { DisclosureNote } from "@/components/soul/disclosure-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setUpVault, unlockVault } from "@/lib/vault";

/**
 * The vault boundary, in two states: first-time setup (choose a passphrase, derive the key
 * locally, store only public KDF params) and unlock (re-derive + verify against the key-check).
 * The passphrase NEVER leaves the browser; the copy is blunt that losing it is unrecoverable.
 */
export function VaultGate({
  status,
  onUnlocked,
}: {
  status: VaultStatus;
  onUnlocked: (key: CryptoKey) => void;
}) {
  return status.configured ? (
    <UnlockForm onUnlocked={onUnlocked} status={status} />
  ) : (
    <SetupForm onUnlocked={onUnlocked} />
  );
}

function SetupForm({ onUnlocked }: { onUnlocked: (key: CryptoKey) => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (passphrase.length < MIN_VAULT_PASSPHRASE_CHARS) {
      toast.error(`Use at least ${MIN_VAULT_PASSPHRASE_CHARS} characters`);
      return;
    }
    if (passphrase !== confirm) {
      toast.error("The passphrases don't match");
      return;
    }
    setBusy(true);
    try {
      const key = await setUpVault(passphrase);
      toast.success("Vault created — key derived in your browser");
      onUnlocked(key);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="flex items-center gap-2.5">
        <ShieldCheck aria-hidden className="size-4 text-pulse-soft" strokeWidth={1.75} />
        <h3 className="font-medium tracking-tight">Set up your private vault</h3>
      </div>
      <DisclosureNote title="Your passphrase is the only key" tone="warning">
        It never leaves this browser — Soul stores only public derivation parameters. If you lose
        the passphrase, your private memories are unrecoverable. There is no reset, by design.
      </DisclosureNote>
      <div className="space-y-1.5">
        <Label htmlFor="vault-pass">Vault passphrase</Label>
        <Input
          autoComplete="new-password"
          id="vault-pass"
          minLength={MIN_VAULT_PASSPHRASE_CHARS}
          onChange={(e) => setPassphrase(e.target.value)}
          type="password"
          value={passphrase}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vault-pass-confirm">Repeat it</Label>
        <Input
          autoComplete="new-password"
          id="vault-pass-confirm"
          onChange={(e) => setConfirm(e.target.value)}
          type="password"
          value={confirm}
        />
      </div>
      <Button className="rounded-full" isLoading={busy} type="submit">
        Create vault
      </Button>
    </form>
  );
}

function UnlockForm({
  status,
  onUnlocked,
}: {
  status: VaultStatus;
  onUnlocked: (key: CryptoKey) => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const key = await unlockVault(passphrase, status);
      if (!key) {
        toast.error("That passphrase doesn't open this vault");
        setBusy(false);
        return;
      }
      toast.success("Vault unlocked for this session");
      onUnlocked(key);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="flex items-center gap-2.5">
        <Lock aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-medium tracking-tight">Unlock your vault</h3>
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Your key is re-derived from the passphrase right here — it is never sent anywhere.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="vault-unlock">Vault passphrase</Label>
        <Input
          autoComplete="current-password"
          id="vault-unlock"
          onChange={(e) => setPassphrase(e.target.value)}
          type="password"
          value={passphrase}
        />
      </div>
      <Button className="gap-2 rounded-full" isLoading={busy} type="submit">
        {!busy && <LockOpen aria-hidden className="size-4" />}
        Unlock
      </Button>
    </form>
  );
}
