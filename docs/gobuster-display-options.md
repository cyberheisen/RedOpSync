# Gobuster Directory Scan — Navigation Pane Display Options

Gobuster output (e.g. your sample) contains a base URL and a list of paths with status/size. The scope tree is **Subnets → Hosts → Ports → Evidence**. Evidence is loaded per port and shown as child nodes; the right pane shows the selected evidence (caption, image or text). Below are practical options for ingesting and displaying Gobuster results in the navigation pane.

---

## Option 1: **Single evidence per scan (under port)** — Recommended

**Tree:** Host → Port (80 or 443) → **“Gobuster dir (2 paths)”** (one evidence node).

- **Backend:** Parse the Gobuster file; resolve host from URL (e.g. `http://192.0.2.10/` → host `192.0.2.10`, port 80). Find or create that host/port, then create **one** Evidence record attached to that port:
  - `source = "gobuster"`
  - `caption` = e.g. `"Gobuster dir — 2 paths"` or `"Gobuster 2025-03-03"`
  - `notes_md` = markdown table or list of paths (path, status, size)
  - `is_pasted = True`, no file (or store raw output in `notes_md`).
- **Frontend:** No tree structure change. Evidence appears under the port like GoWitness. Exclude `source === "gobuster"` from the port “Add report” list (like gowitness) so it only appears in the tree.
- **Detail pane:** When the user selects this evidence, show caption + **rendered `notes_md`** (path list/table). Today the pane only shows image or caption for non-image evidence; a small change to render `notes_md` for evidence would support this.

**Pros:** Reuses existing evidence model and tree; one node per scan; simple to implement.  
**Cons:** Paths are not individual nodes (no per-path selection in the tree).

---

## Option 2: **One evidence per path (under port)**

**Tree:** Host → Port 80 → **“/admin (301)”**, **“/api (200)”**, …

- **Backend:** For each path line, create one Evidence record on the same port: `caption = "/admin (301) [Size: 0]"`, `source = "gobuster"`, optional `notes_md` with extra detail.
- **Frontend:** Unchanged; each path is a normal evidence node under the port.

**Pros:** Each path is a first-class node (filterable, taggable, linkable).  
**Cons:** Many evidence rows for large wordlists; tree can get very long under one port.

---

## Option 3: **Expandable “Directory scan” node (one scan, paths as children)**

**Tree:** Host → Port 80 → **“Gobuster dir”** [▼] → `/admin`, `/api`, …

- **Backend:** Either:
  - **A)** One parent Evidence (“Gobuster dir”) + a new table `directory_scan_paths(evidence_id, path, status, size)` for children; or  
  - **B)** One parent Evidence + child Evidence rows with a `parent_evidence_id` (schema change).
- **Frontend:** New tree behavior: when the node is “directory-scan” evidence, expand to show path children (from API). Path rows are selectable; detail pane shows path details or the full list.

**Pros:** One scan = one expandable node; paths visible in tree without hundreds of evidence rows.  
**Cons:** New schema and/or API and tree rendering logic.

---

## Option 4: **Host-level “Web paths” (no port required)**

**Tree:** Host → **“Directory scans”** or **“Web paths”** → one or more scan/path nodes.

- **Backend:** Evidence can already have `host_id` and `port_id = null`. Store Gobuster results as host-level evidence (and optionally a small “paths” structure if you add it).
- **Frontend:** Today evidence is only loaded per port (`evidenceByPort`). You’d add loading and display of **host-level evidence** (where `port_id` is null) under the host, e.g. a “Directory scans” or “Web paths” section between Host and Ports.

**Pros:** Works when the target port (80/443) is not yet in scope.  
**Cons:** Requires frontend changes to show host-level evidence in the tree and possibly a different tree section.

---

## Recommendation

- **Short term:** **Option 1** — one Evidence per Gobuster run under the inferred port, with path list in `notes_md` and detail pane updated to render `notes_md` for evidence. Add Gobuster to the import dispatcher (parser + find/create host/port + create evidence), and exclude `source === "gobuster"` in the port attachments list so it only appears in the tree.
- **Later:** If you need per-path nodes without hundreds of evidence rows, consider **Option 3** (expandable directory-scan node with a small `directory_scan_paths` table and dedicated tree expansion).

If you tell me which option you want (e.g. “implement Option 1”), I can outline the exact code changes (parser, import service, dispatcher, and frontend tweaks).
