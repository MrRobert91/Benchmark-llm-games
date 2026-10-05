"""A frozen, separately labelled recovery/context supplement sharing the SAME cap.

Run only after the main campaign exits; concurrent campaign processes are forbidden.
"""
import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime, timezone
from moloch.benchmark.versions.paper_2608_01193_v1.engine import derive_seed
from moloch.research import SKINS
from tools.reproduce_paper import CampaignLedger, run_race, write_json


def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--out",type=Path,default=Path("../docs/results/reproduction-20261005")); args=parser.parse_args(); out=args.out
    plan_path=out/"supplement-manifest.json"
    if not plan_path.exists():
        jobs=[]
        # Infrastructure-failed cells receive fresh seeds; original failures stay visible.
        for p in sorted((out/"races").glob("*.json")):
            r=json.loads(p.read_text(encoding="utf-8"))
            if r.get("status")=="failed" and r["research"]["module"]=="baseline":
                j=dict(r["research"]); name="infrastructure-recovery:"+j["id"]
                j.update({"id":hashlib.sha256(name.encode()).hexdigest()[:16],"seed":derive_seed(20261005,name),"repetition":100+j["repetition"],"replaces_failed_cell":r["research"]["id"],"scope":"exploratory-infrastructure-recovery"}); jobs.append(j)
        # Small live context comparison: same seed/horizon, both codes fully crossed.
        # Controls include abstract framing at BOTH mappings, not repetition-parity mapping.
        model="qwen/qwen-2.5-7b-instruct"
        for risk in (.1,.6,.9):
            for rep in (1,2):
                for skin in SKINS:
                    for mapping in ("P","Q"):
                        block=f"live-context:{model}:{risk}:{rep}"; condition=f"opaque:{skin}:{mapping}"
                        jobs.append({"id":hashlib.sha256(f"{block}:{condition}".encode()).hexdigest()[:16],"model":model,"risk":risk,"players":2,"repetition":rep,"condition":condition,"module":"live-context","scope":"exploratory-reconstructed-context","seed":derive_seed(20261005,block)})
        # Fig. 9's full N/risk/persona crossing. Each pooled band has both levels,
        # all three N values and all three risks; baseline has two repeats per cell.
        for risk in (.1,.6,.9):
            for n in (3,4,5):
                for level in range(1,7):
                    for model in ("openai/gpt-5-nano","openai/gpt-5.4-nano"):
                        block=f"multiplayer-persona:{model}:{risk}:{n}:{level}"
                        jobs.append({"id":hashlib.sha256(block.encode()).hexdigest()[:16],"model":model,"risk":risk,"players":n,"repetition":1,"condition":f"persona-{level}","module":"multiplayer-persona","scope":"exploratory-reconstructed-N-persona","seed":derive_seed(20261005,block)})
        write_json(plan_path,{"created_at":datetime.now(timezone.utc).isoformat(),"jobs":jobs,"hash":hashlib.sha256(json.dumps(jobs,sort_keys=True).encode()).hexdigest(),"spend":"shares primary ledger.json and $5 cap; no new allowance","notes":["Supplement frozen after inspecting the initial campaign and infrastructure failures, not confirmatory.","Fully crossed matched live context/mapping diagnostic; no causal strategic inference.","N-player persona supplement crosses all six levels, all three private risks, N=3–5 and both published OpenAI checkpoints. Pooling both levels gives multiple independent races per persona band, while exact level/N/risk cells have one race."]})
    plan=json.loads(plan_path.read_text(encoding="utf-8")); catalog=json.loads((out/"catalog.json").read_text(encoding="utf-8")); ledger=CampaignLedger(out/"ledger.json",limit=5)
    with ThreadPoolExecutor(max_workers=32) as pool:
        list(pool.map(lambda job:run_race(job,out,ledger,catalog),plan["jobs"]))
    ledger.checkpoint()
    print(f"Supplement finished, shared total ${ledger.spent:.6f}")

if __name__=="__main__": main()
