"""Export readable campaign traces from its frozen archive without new API calls.

Run from backend: python -m tools.export_replay_traces
"""
import json
from pathlib import Path
import zipfile

from moloch.traces import public_trace


def main():
    public = Path("../frontend/public")
    target = public / "data/traces"
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(public / "research/reproduction-20261005.zip") as archive:
        for path in sorted((public / "data/games").glob("*.json")):
            replay = json.loads(path.read_text(encoding="utf-8"))
            job = replay.get("research", {}).get("id")
            if not job:
                continue
            raw = json.loads(archive.read(f"calls/{job}.json"))
            result = {"game_id": replay["game_id"], "source": "campaign-archive",
                      "calls": [public_trace(call, i) for i, call in enumerate(raw, 1)]}
            (target / path.name).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(f"Exported {len(list(target.glob('*.json')))} replay trace files")


if __name__ == "__main__":
    main()
