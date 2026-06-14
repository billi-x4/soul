/*
 * Soul onboarding — the personal-context questionnaire.
 *
 * This is the structured set of questions that builds a person's "soul": who they are, what they've
 * done, what they're good at, and where they're headed. The schema is shared so the web renders the
 * multi-step form from it and the API can validate + compile the answers. Answers are stored in
 * Postgres (personal_context) and the compiled narrative is fed into the MemWal `bio` namespace so it
 * becomes recallable soul memory.
 */

export type OnboardingFieldType = "short" | "long" | "tags";

export interface OnboardingQuestion {
  id: string;
  label: string;
  placeholder?: string;
  type: OnboardingFieldType;
  hint?: string;
}

export interface OnboardingSection {
  id: string;
  title: string;
  description: string;
  questions: OnboardingQuestion[];
}

/** A user's answers: question id -> value (string for short/long, string[] for tags). */
export type OnboardingAnswers = Record<string, string | string[]>;

export const ONBOARDING_SECTIONS: OnboardingSection[] = [
  {
    id: "identity",
    title: "Who you are",
    description: "The core of your story.",
    questions: [
      { id: "full_name", label: "Your name", type: "short", placeholder: "Ada Lovelace" },
      {
        id: "location",
        label: "Where you're based",
        type: "short",
        placeholder: "Berlin, Germany",
      },
      {
        id: "headline",
        label: "One line that describes you",
        type: "short",
        placeholder: "Full-stack engineer & founder",
      },
      {
        id: "bio",
        label: "Tell your story",
        type: "long",
        placeholder: "Who you are and how you got here, in a few sentences.",
      },
      {
        id: "languages",
        label: "Languages you speak",
        type: "tags",
        placeholder: "English, Urdu…",
      },
    ],
  },
  {
    id: "work",
    title: "Work & experience",
    description: "What you do and what you've done.",
    questions: [
      {
        id: "current_role",
        label: "Current role / title",
        type: "short",
        placeholder: "Senior Engineer",
      },
      {
        id: "current_org",
        label: "Company / organization",
        type: "short",
        placeholder: "Acme Inc.",
      },
      { id: "years_experience", label: "Years of experience", type: "short", placeholder: "8" },
      {
        id: "past_roles",
        label: "Past roles & companies",
        type: "long",
        placeholder: "Where you've worked and what you did there.",
      },
      {
        id: "achievements",
        label: "Proudest achievements",
        type: "long",
        placeholder: "Things you've shipped, led, or are proud of.",
      },
      {
        id: "industries",
        label: "Industries / domains",
        type: "tags",
        placeholder: "fintech, AI, crypto…",
      },
    ],
  },
  {
    id: "skills",
    title: "Skills & expertise",
    description: "What you're great at.",
    questions: [
      {
        id: "skills",
        label: "Top skills",
        type: "tags",
        placeholder: "TypeScript, system design…",
      },
      {
        id: "tools",
        label: "Tools & technologies",
        type: "tags",
        placeholder: "React, Postgres, Sui…",
      },
      {
        id: "strengths",
        label: "What are you exceptional at?",
        type: "long",
        placeholder: "Your superpowers.",
      },
      {
        id: "learning",
        label: "What are you learning right now?",
        type: "long",
        placeholder: "Skills or topics you're actively improving.",
      },
    ],
  },
  {
    id: "projects",
    title: "Projects & work",
    description: "Things you've built and shared.",
    questions: [
      {
        id: "projects",
        label: "Notable projects",
        type: "long",
        placeholder: "What you built, the tech, and the impact.",
      },
      {
        id: "writing",
        label: "Writing, talks, or content",
        type: "long",
        placeholder: "Anything you've published or presented.",
      },
      { id: "github", label: "GitHub", type: "short", placeholder: "https://github.com/you" },
      {
        id: "website",
        label: "Website / portfolio",
        type: "short",
        placeholder: "https://you.dev",
      },
      { id: "x", label: "X / Twitter", type: "short", placeholder: "https://x.com/you" },
      {
        id: "linkedin",
        label: "LinkedIn",
        type: "short",
        placeholder: "https://linkedin.com/in/you",
      },
    ],
  },
  {
    id: "goals",
    title: "Goals & what's next",
    description: "Where you're headed.",
    questions: [
      {
        id: "now",
        label: "What are you working on right now?",
        type: "long",
        placeholder: "Your current focus.",
      },
      {
        id: "short_term",
        label: "Goals for the next 6–12 months",
        type: "long",
        placeholder: "What you want to achieve soon.",
      },
      {
        id: "long_term",
        label: "Your long-term vision",
        type: "long",
        placeholder: "The bigger picture.",
      },
      {
        id: "next",
        label: "What might you do next?",
        type: "long",
        placeholder: "Directions or ideas you're considering exploring.",
      },
      {
        id: "looking_for",
        label: "What help or opportunities are you looking for?",
        type: "long",
        placeholder: "Collaborators, roles, intros, advice…",
      },
    ],
  },
  {
    id: "interests",
    title: "Interests & values",
    description: "What you care about.",
    questions: [
      {
        id: "interests",
        label: "Interests & hobbies",
        type: "tags",
        placeholder: "climbing, jazz, chess…",
      },
      {
        id: "topics",
        label: "Topics you love",
        type: "tags",
        placeholder: "decentralization, design…",
      },
      {
        id: "values",
        label: "What do you value most?",
        type: "long",
        placeholder: "Principles that guide you.",
      },
    ],
  },
  {
    id: "style",
    title: "How you work",
    description: "Your operating style.",
    questions: [
      {
        id: "work_style",
        label: "How do you like to work?",
        type: "long",
        placeholder: "Solo vs. team, deep work, pace, environment…",
      },
      {
        id: "comm_style",
        label: "Your communication style",
        type: "long",
        placeholder: "Direct, detailed, async, visual…",
      },
      {
        id: "decisions",
        label: "How do you make decisions?",
        type: "long",
        placeholder: "Data-driven, intuitive, consensus…",
      },
    ],
  },
  {
    id: "ai",
    title: "How AI should treat you",
    description: "Tune your soul's voice.",
    questions: [
      {
        id: "address",
        label: "How should AI address you?",
        type: "short",
        placeholder: "Ada, or 'hey'",
      },
      { id: "tone", label: "Preferred tone", type: "short", placeholder: "concise and friendly" },
      {
        id: "always_know",
        label: "What should AI always know about you?",
        type: "long",
        placeholder: "Context to keep front of mind.",
      },
      {
        id: "avoid",
        label: "Anything AI should avoid?",
        type: "long",
        placeholder: "Assumptions or topics to steer clear of.",
      },
    ],
  },
];

/** Total number of questions across all sections. */
export const ONBOARDING_QUESTION_COUNT = ONBOARDING_SECTIONS.reduce(
  (n, s) => n + s.questions.length,
  0
);

// Tolerates malformed persisted values (numbers, nested objects) instead of throwing —
// answers round-trip through client JSON and a Walrus blob, neither of which we control.
const valueToText = (v: string | string[] | undefined): string => {
  if (Array.isArray(v)) {
    return v.filter((s): s is string => typeof s === "string" && s.length > 0).join(", ");
  }
  return typeof v === "string" ? v.trim() : "";
};

/** How many questions have a non-empty answer (for progress / completeness display). */
export function countAnswered(answers: OnboardingAnswers): number {
  let n = 0;
  for (const section of ONBOARDING_SECTIONS) {
    for (const q of section.questions) {
      if (valueToText(answers[q.id])) {
        n++;
      }
    }
  }
  return n;
}

/**
 * Compile answers into a readable narrative grouped by section — the text fed into the soul's `bio`
 * memory. Empty answers are skipped.
 */
export function compilePersonalContext(answers: OnboardingAnswers): string {
  const blocks: string[] = [];
  for (const section of ONBOARDING_SECTIONS) {
    const lines: string[] = [];
    for (const q of section.questions) {
      const text = valueToText(answers[q.id]);
      if (text) {
        lines.push(`${q.label}: ${text}`);
      }
    }
    if (lines.length > 0) {
      blocks.push(`## ${section.title}\n${lines.join("\n")}`);
    }
  }
  return blocks.join("\n\n");
}
