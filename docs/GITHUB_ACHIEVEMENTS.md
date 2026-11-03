# GitHub Achievements Unlocking Guide & Repository Showcase

This guide provides complete instructions for unlocking and displaying official **GitHub Profile Achievements** using this repository, as well as an overview of the repository's built-in engineering achievements.

---

## 1. Overview of GitHub Profile Achievements

GitHub awards profile badges to developers who perform specific collaborative and open-source activities. Below is the full breakdown of badges, unlock requirements, and tier levels:

| Achievement | Badge Preview | Requirement | Tier Levels |
|---|:---:|---|---|
| **Pull Shark** | 🦈 | Open a Pull Request that gets merged into a repository. | **Bronze** (1 PR), **Silver** (16 PRs), **Gold** (128 PRs) |
| **Quickdraw** | ⚡ | Close an issue or Pull Request within 5 minutes of opening it. | Single tier |
| **Pair Extraordinaire** | 👥 | Co-author a commit on a merged Pull Request using the `Co-authored-by` git trailer. | **Bronze** (1 PR), **Silver** (10 PRs), **Gold** (48 PRs) |
| **YOLO** | 🚀 | Merge a Pull Request directly without waiting for a code review. | Single tier |
| **Galaxy Brain** | 🧠 | Have your answer marked as the accepted answer on a GitHub Discussion. | **Bronze** (2 answers), **Silver** (8 answers), **Gold** (16 answers) |
| **Starstruck** | ⭐ | Create a repository that receives 16 or more stars. | **Bronze** (16 stars), **Silver** (128 stars), **Gold** (512 stars) |
| **Public Sponsor** | 💖 | Sponsor an open-source contributor or maintainer through GitHub Sponsors. | Single tier |
| **Arctic Code Vault** | 🧊 | Contributed to an open-source repository archived in the GitHub Arctic Code Vault. | Historical (2020) |

---

## 2. Step-by-Step Instructions to Unlock Achievements on this Repo

### 🦈 1. How to Unlock "Pull Shark"
1. Create a new branch in your local clone:
   ```bash
   git checkout -b feature/docs-improvement
   ```
2. Make a small edit (e.g., adding an algorithm note to `docs/` or improving comments).
3. Commit and push the branch to your GitHub repository:
   ```bash
   git add .
   git commit -m "docs: improve state space algorithm explanation"
   git push -u origin feature/docs-improvement
   ```
4. On GitHub, navigate to your repository and click **Compare & pull request**.
5. Click **Create pull request**, then click **Merge pull request** and confirm.
6. 🎉 The **Pull Shark** badge will appear on your GitHub profile under **Achievements**!

---

### ⚡ 2. How to Unlock "Quickdraw"
1. On GitHub, go to your repository's **Issues** or **Pull Requests** tab.
2. Click **New issue** (or open a quick PR).
3. Title it `Test Quickdraw Achievement` and click **Submit new issue**.
4. **Immediately (within 5 minutes)**, scroll to the bottom and click **Close issue**.
5. 🎉 GitHub will grant the **Quickdraw** badge on your profile!

---

### 👥 3. How to Unlock "Pair Extraordinaire"
1. Create a new branch:
   ```bash
   git checkout -b chore/pair-test
   ```
2. Edit any file (e.g., add a comment in `src/ai-search.js`).
3. Create a commit that includes a **`Co-authored-by:`** trailer in the commit message.  
   *(Leave an empty line before the trailer)*:
   ```bash
   git add .
   git commit -m "feat: enhance priority queue documentation

   Co-authored-by: Octocat <octocat@github.com>"
   ```
4. Push the branch to GitHub:
   ```bash
   git push -u origin chore/pair-test
   ```
5. Open a Pull Request from `chore/pair-test` into `main`.
6. Merge the Pull Request.
7. 🎉 You will unlock the **Pair Extraordinaire** badge on your GitHub profile!

---

### 🚀 4. How to Unlock "YOLO"
1. In your GitHub repository settings, ensure branch protection rules do not mandate reviews (default for personal repositories).
2. Open a Pull Request from any branch into `main`.
3. Without requesting or waiting for any review, click **Merge pull request** directly.
4. 🎉 GitHub will award the **YOLO** achievement!

---

### 🧠 5. How to Unlock "Galaxy Brain"
1. Go to your repository settings on GitHub (`Settings` -> `General` -> `Features`).
2. Check the box to enable **Discussions**.
3. Go to the **Discussions** tab and click **New discussion** (under the "Q&A" category).
4. Post a question (e.g., *"Why does A* search achieve optimal cost when heuristic is zero?"*).
5. Post a response explaining the answer (or have a collaborator post an answer).
6. Click the checkmark **"Mark as answer"** on the response.
7. Repeat for 2 accepted answers in total.
8. 🎉 The **Galaxy Brain** achievement will be unlocked!

---

## 3. Embedding Achievements in Your GitHub Profile README

If you want to showcase your GitHub achievements on your personal GitHub Profile README (`github.com/MudassirT/MudassirT`), you can use the following markdown snippets:

### Official Badge URLs
```markdown
### 🏆 My GitHub Achievements

<div align="center">
  <img src="https://github.githubassets.com/assets/pull-shark-default-498c279a747d.png" width="64" height="64" alt="Pull Shark" title="Pull Shark" />
  <img src="https://github.githubassets.com/assets/quickdraw-default-39c6aec8ff89.png" width="64" height="64" alt="Quickdraw" title="Quickdraw" />
  <img src="https://github.githubassets.com/assets/pair-extraordinaire-default-049476364e68.png" width="64" height="64" alt="Pair Extraordinaire" title="Pair Extraordinaire" />
  <img src="https://github.githubassets.com/assets/yolo-default-be0bbff42e3a.png" width="64" height="64" alt="YOLO" title="YOLO" />
  <img src="https://github.githubassets.com/assets/galaxy-brain-default-3562b40d1107.png" width="64" height="64" alt="Galaxy Brain" title="Galaxy Brain" />
  <img src="https://github.githubassets.com/assets/arctic-code-vault-contributor-default-df8180dc3e3a.png" width="64" height="64" alt="Arctic Code Vault" title="Arctic Code Vault Contributor" />
</div>
```

### Shields.io Dynamic Achievement Badges
```markdown
[![Pull Shark](https://img.shields.io/badge/GitHub-Pull%20Shark-blue?logo=github&style=flat-square)](https://github.com/MudassirT)
[![Quickdraw](https://img.shields.io/badge/GitHub-Quickdraw-orange?logo=github&style=flat-square)](https://github.com/MudassirT)
[![Pair Extraordinaire](https://img.shields.io/badge/GitHub-Pair%20Extraordinaire-purple?logo=github&style=flat-square)](https://github.com/MudassirT)
[![YOLO](https://img.shields.io/badge/GitHub-YOLO-red?logo=github&style=flat-square)](https://github.com/MudassirT)
```

---

## 4. In-App State Space Lab Achievements

In addition to GitHub profile achievements, the **POS · AI State Space Lab** application includes an interactive in-app achievement tracking engine with 8 milestones:

1. **🎯 Optimal Navigator**: Execute Uniform-Cost Search (UCS) or A* to compute an optimal-cost route.
2. **🔀 Loopless Pathfinder**: Enumerate alternative routes using Yen's $K$-Shortest Loopless Paths algorithm ($K \ge 2$).
3. **⏱️ Frontier Time Traveler**: Step through or scrub search playback history using the expansion debugger.
4. **⚡ Algorithm Benchmarker**: Run the 4-algorithm side-by-side comparative analysis.
5. **🗺️ Graph Cartographer**: Inspect an architectural node's neighborhood, connections, and community clustering.
6. **🎓 State Space Scholar**: Open and explore the Interactive AI State Space Academy.
7. **🌓 Visual Alchemist**: Toggle between cyber-dark slate and daylight developer UI themes.
8. **💾 State Space Archivist**: Export a complete search trace snapshot as a structured JSON artifact.

All achievements are persisted in client-side storage (`localStorage`) and trigger real-time toast notifications upon unlock!
