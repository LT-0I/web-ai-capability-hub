# generate/csv

Status: INCONCLUSIVE (delivered as pandas source script, not raw .csv)

Path: composer prompt for capitals.csv → Gemini code-execution sandbox produced
a pandas `to_csv()` script. `Download code` button yields the pandas script,
NOT the produced CSV. The CSV itself lives ephemerally inside the sandbox
(`/mnt/data/capitals.csv`) and there is no end-user click to retrieve it.

Artifact:
- File: `download/0f2f69f569ce7a58a74c98467e6a8552837050ac638d0506c3871bad7d24ca46.py`
- Size: 483 bytes
- sha256: `0f2f69f569ce7a58a74c98467e6a8552837050ac638d0506c3871bad7d24ca46`
- Content: pandas script with 5 capital cities (Tokyo/Delhi/Cairo/Mexico City/London).

Key architectural finding: **Gemini does NOT have a "Download as .csv" button.**
Code-execution sandbox artifacts are returned as their source Python file.
This is the same shape observed in `generate/markdown` and `generate/python`.
