"use client";

import {
  countAnswered,
  ONBOARDING_QUESTION_COUNT,
  ONBOARDING_SECTIONS,
  type OnboardingAnswers,
  type OnboardingQuestion,
} from "@soul/shared";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ContextResult, saveContext } from "@/lib/auth";

/**
 * The personal-context questionnaire as a multi-step form (one section per step). Layout-neutral so
 * it works both in the full-screen onboarding gate and inside the /profile editor. Saves via the API;
 * `completed=false` records a skip, `true` finishes (and triggers the soul bio ingest server-side).
 */
export function SoulOnboarding({
  initialAnswers,
  allowSkip = false,
  submitLabel = "Finish",
  onExit,
  onCancel,
}: {
  initialAnswers: OnboardingAnswers;
  allowSkip?: boolean;
  submitLabel?: string;
  onExit: (completed: boolean, answers: OnboardingAnswers, result?: ContextResult) => void;
  onCancel?: () => void;
}) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const section = ONBOARDING_SECTIONS[step];
  if (!section) {
    return null;
  }
  const isLast = step === ONBOARDING_SECTIONS.length - 1;
  const answered = countAnswered(answers);

  function update(id: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  async function persist(completed: boolean) {
    setBusy(true);
    try {
      const r = await saveContext(answers, completed);
      onExit(completed, r.answers, r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>
            Step {step + 1} of {ONBOARDING_SECTIONS.length}
          </span>
          <span>
            {answered}/{ONBOARDING_QUESTION_COUNT} answered
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${((step + 1) / ONBOARDING_SECTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-1">
        <h2 className="font-medium text-2xl tracking-tight">{section.title}</h2>
        <p className="text-muted-foreground text-sm">{section.description}</p>
      </div>

      <div className="space-y-4 text-left">
        {section.questions.map((q) => (
          <Field key={q.id} onChange={(v) => update(q.id, v)} question={q} value={answers[q.id]} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <div>
          {step > 0 ? (
            <Button disabled={busy} onClick={() => setStep(step - 1)} size="sm" variant="ghost">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          ) : onCancel ? (
            <Button disabled={busy} onClick={onCancel} size="sm" variant="ghost">
              Cancel
            </Button>
          ) : (
            <span />
          )}
        </div>
        <div className="flex items-center gap-2">
          {allowSkip && (
            <Button
              className="text-muted-foreground"
              disabled={busy}
              onClick={() => persist(false)}
              size="sm"
              variant="ghost"
            >
              Skip for now
            </Button>
          )}
          {isLast ? (
            <Button
              className="rounded-full"
              disabled={busy}
              isLoading={busy}
              onClick={() => persist(true)}
            >
              {submitLabel}
            </Button>
          ) : (
            <Button
              className="gap-1.5 rounded-full"
              disabled={busy}
              onClick={() => setStep(step + 1)}
            >
              Next
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  question,
  value,
  onChange,
}: {
  question: OnboardingQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const id = `q-${question.id}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{question.label}</Label>
      {question.type === "long" ? (
        <Textarea
          id={id}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          rows={3}
          value={typeof value === "string" ? value : ""}
        />
      ) : question.type === "tags" ? (
        <TagInput
          id={id}
          onChange={onChange}
          placeholder={question.placeholder}
          value={Array.isArray(value) ? value : []}
        />
      ) : (
        <Input
          id={id}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          value={typeof value === "string" ? value : ""}
        />
      )}
      {question.hint ? <p className="text-muted-foreground text-xs">{question.hint}</p> : null}
    </div>
  );
}

function TagInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      const next = [...value];
      for (const p of parts) {
        if (!next.includes(p)) {
          next.push(p);
        }
      }
      onChange(next);
    }
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring">
      {value.map((tag) => (
        <span
          className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-accent-foreground text-xs"
          key={tag}
        >
          {tag}
          <button
            aria-label={`Remove ${tag}`}
            className="text-accent-foreground/70 hover:text-accent-foreground"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            type="button"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        className="min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        id={id}
        onBlur={() => draft && add(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        placeholder={value.length ? "" : placeholder}
        value={draft}
      />
    </div>
  );
}
