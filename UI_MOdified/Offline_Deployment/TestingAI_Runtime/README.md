# TestingAI_Runtime — WarGamingGEN Runtime Volume Mounts

This directory contains the **writable runtime I/O directories** for WarGamingGEN
when running inside the Docker container. These subdirectories are mounted into the
container and replace the corresponding directories inside the image.

---

## Directory purpose

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `import_from_rmooz/` | `/app/TestingAI/import_from_rmooz` | DOCX input files (red_team.docx, blue_team.docx) |
| `export_to_rmooz/` | `/app/TestingAI/export_to_rmooz` | Wargame output (GeoJSON, CSV, Markdown) |
| `runs/` | `/app/TestingAI/WarGamingGEN/runs` | Per-run checkpoints and outputs |

---

## Workflow

1. **Before generation:** copy DOCX OOB files here:
   ```
   TestingAI_Runtime/import_from_rmooz/forces/red_team.docx
   TestingAI_Runtime/import_from_rmooz/forces/blue_team.docx
   ```

2. **Trigger generation:** use the RMOOZ import wizard in the browser.

3. **After generation:** find results in:
   ```
   TestingAI_Runtime/export_to_rmooz/<run-id>/
     geojson/all_phases.geojson
     wargame_report.md
     wargameschedule.csv
   TestingAI_Runtime/runs/<run-id>/
     checkpoints/  (resumable phase snapshots)
     outputs/      (same as export_to_rmooz)
   ```

---

## Notes

- All directories here persist across container restarts (host filesystem, not Docker volumes).
- `import_from_rmooz/` content is consumed by WarGamingGEN at generation time.
- `runs/` and `export_to_rmooz/` grow over time — clean up old runs manually.
- These directories are empty by default — the app starts fine without DOCX files.
  Generation will fail with a clear error if red_team.docx / blue_team.docx are missing.
