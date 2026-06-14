/*
 * GitHub self-import (US2, FR-009) — the user's OWN public GitHub data via Octokit.
 * Unauthenticated works (60 req/hr); set GITHUB_TOKEN to raise the limit. Own-data only.
 */
import { Octokit } from "@octokit/rest";
import { BadRequestError } from "../../pkg/errors/error";

export async function importGithub(username: string): Promise<string> {
  try {
    const token = process.env.GITHUB_TOKEN;
    const octokit = token ? new Octokit({ auth: token }) : new Octokit();
    const { data: user } = await octokit.rest.users.getByUsername({ username });
    const { data: repos } = await octokit.rest.repos.listForUser({
      username,
      per_page: 30,
      sort: "updated",
    });

    const lines: string[] = [`GitHub profile: ${user.login}`];
    if (user.name) {
      lines.push(`Name: ${user.name}`);
    }
    if (user.bio) {
      lines.push(`Bio: ${user.bio}`);
    }
    if (user.company) {
      lines.push(`Company: ${user.company}`);
    }
    if (user.location) {
      lines.push(`Location: ${user.location}`);
    }
    lines.push(`Public repositories: ${user.public_repos}`);
    for (const r of repos) {
      const desc = r.description ? `: ${r.description}` : "";
      const lang = r.language ? ` [${r.language}]` : "";
      lines.push(`- ${r.name}${desc}${lang} (★${r.stargazers_count ?? 0})`);
    }
    return lines.join("\n");
  } catch (e) {
    throw new BadRequestError(`GitHub import failed: ${(e as Error).message}`);
  }
}
