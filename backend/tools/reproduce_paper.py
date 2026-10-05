"""Frozen, resumable OpenRouter research campaign. Run from backend, not at import.

python -m tools.reproduce_paper --out ../docs/results/reproduction-20261005
Keys live only in the environment. No secrets are written to artefacts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx

from moloch import db
from moloch.agents.openrouter import BudgetExceeded, BudgetGuard
from moloch.benchmark.registry import PAPER_PROTOCOL_VERSION, get_benchmark, PAPER_BENCHMARK_VERSION
from moloch.benchmark.versions.paper_2608_01193_v1.agents import PAPER_SYSTEM_PROMPT
from moloch.benchmark.versions.paper_2608_01193_v1.engine import PaperGame, derive_seed
from moloch.research import ResearchAgent, RESEARCH_PROTOCOL, protocol_hash, task_probes, score_probe

CONTRIBUTOR = {"nick": "RustyRoboz", "url": "https://www.rustyrobozlabs.com"}
ROSTER = [
    ("anthropic/claude-opus-5", 2, "paper"),
    ("anthropic/claude-sonnet-5", 2, "paper"),
    ("google/gemini-3-flash-preview", 3, "paper"),
    ("openai/gpt-5-nano", 6, "paper"),
    ("openai/gpt-5.4-nano", 6, "paper"),
    ("google/gemini-3.1-flash-lite", 6, "paper-route-reconstruction"),
    ("google/gemini-3.5-flash-lite", 6, "paper"),
    ("openai/gpt-5.6-luna", 6, "paper-extended-roster"),
    ("qwen/qwen-2.5-7b-instruct", 8, "paper-audit-checkpoint"),
    ("google/gemma-3-4b-it", 10, "new-cheap-extension"),
    ("mistralai/mistral-nemo", 10, "new-cheap-extension"),
]

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    for attempt in range(10):
        try:
            temp.replace(path)
            break
        except PermissionError:
            if attempt == 9: raise
            time.sleep(.05 * (attempt + 1))


class CampaignLedger:
    """Reserve worst-case cost before EACH attempt; persist uncertain charges too."""
    def __init__(self, path, limit=5.0):
        self.path, self.limit = path, limit
        self.lock = threading.RLock()
        self.entries = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        self.journal = path.with_suffix(".jsonl")
        if self.journal.exists():
            raw=self.journal.read_bytes()
            # An incomplete final append cannot have authorised a transmitted request.
            if raw and not raw.endswith(b"\n"):
                raw=raw[:raw.rfind(b"\n")+1]
                self.journal.write_bytes(raw)
            for line in raw.splitlines():
                event=json.loads(line); index=event["index"]
                if index==len(self.entries): self.entries.append(event["entry"])
                elif index<len(self.entries): self.entries[index]=event["entry"]
                else: raise ValueError("Non-contiguous budget journal; refusing to reset spend")

    def persist(self,index):
        self.journal.parent.mkdir(parents=True,exist_ok=True)
        with self.journal.open("a",encoding="utf-8") as handle:
            handle.write(json.dumps({"index":index,"entry":self.entries[index]},ensure_ascii=False)+"\n")
            handle.flush()
            os.fsync(handle.fileno())

    def checkpoint(self):
        with self.lock: write_json(self.path,self.entries)

    @property
    def spent(self): return sum(entry["charged_usd"] for entry in self.entries)

    def reserve(self, amount, metadata=None):
        with self.lock:
            if self.spent + amount > self.limit:
                raise BudgetExceeded("Campaign preflight budget: insufficient headroom for the worst-case request")
            index = len(self.entries)
            self.entries.append({**(metadata or {}), "charged_usd": amount, "accounting": "pending-upper-bound"})
            self.persist(index)
            return index

    def settle(self, index, entry):
        with self.lock:
            self.entries[index] = entry
            self.persist(index)


class PricedClient:
    def __init__(self, client, ledger, pricing, job):
        self.client, self.ledger, self.pricing, self.job = client, ledger, pricing, job

    def post(self, url, *, json: dict, **kwargs):
        payload = dict(json)
        prompt_price = float(self.pricing["prompt"]) * 1.5
        completion_price = float(self.pricing["completion"]) * 1.5
        payload["provider"] = {"sort": "price", "max_price": {"prompt": prompt_price*1e6, "completion": completion_price*1e6, "request": 0}}
        # UTF-8 bytes upper-bound text tokens, plus ample chat-template overhead.
        input_bound = sum(len(m["content"].encode("utf-8")) for m in payload["messages"]) + 1024
        reserve = (input_bound*prompt_price + payload["max_tokens"]*completion_price)*1.1
        trace = {"job": self.job, "model": payload["model"], "request": payload, "reserved_usd": reserve, "created_at": datetime.now(timezone.utc).isoformat()}
        reservation = self.ledger.reserve(reserve, trace)
        try:
            response = self.client.post(url, json=payload, **kwargs)
            try: data = response.json()
            except ValueError: data = {}
            usage = data.get("usage") or {}
            # Uncertain success/network is accounted at its full reservation, never zero.
            cost = float(usage["cost"]) if usage.get("cost") is not None else (0 if 400 <= response.status_code < 500 else reserve)
            trace.update({"charged_usd": cost, "accounting": "reported" if usage.get("cost") is not None else "uncertain-upper-bound" if cost else "http-rejection", "status_code": response.status_code, "response": data})
            return response
        except Exception as exc:
            trace.update({"charged_usd": reserve, "accounting": "uncertain-upper-bound", "error": type(exc).__name__})
            raise
        finally:
            self.ledger.settle(reservation, trace)

    def close(self): self.client.close()


def build_plan():
    jobs=[]
    def add(model, risk, n, rep, condition, module, scope):
        block=f"{module}:{model}:{risk}:{n}:{rep}"
        jobs.append({"id": hashlib.sha256(f"{block}:{condition}".encode()).hexdigest()[:16], "model":model, "risk":risk,"players":n,"repetition":rep,"condition":condition,"module":module,"scope":scope,"seed":derive_seed(20261005,block)})
    for model,reps,scope in ROSTER:
        for rep in range(1,reps+1):
            for risk in (.1,.6,.9): add(model,risk,2,rep,"canonical","baseline",scope)
    for model in ("openai/gpt-5-nano","openai/gpt-5.4-nano"):
        for rep in (1,2):
            for n in (3,4,5):
                for risk in (.1,.6,.9): add(model,risk,n,rep,"canonical","multiplayer","paper")
    qwen="qwen/qwen-2.5-7b-instruct"
    for rep in (1,2,3):
        for risk in (.1,.6,.9):
            for condition in ("canonical","card"): add(qwen,risk,2,rep,condition,"arithmetic","diagnostic")
    for rep in (1,2):
        for risk in (.1,.6,.9):
            for level in range(1,7): add(qwen,risk,2,rep,f"persona-{level}","persona","diagnostic")
    return jobs


def make_agent(model, job_id, ledger, pricing, **kwargs):
    agent=ResearchAgent(model=model, api_key=os.environ["OPENROUTER_API_KEY"], budget=BudgetGuard(limit_usd=100), timeout=45, **kwargs)
    agent._client=PricedClient(agent._client,ledger,pricing,job_id)
    return agent


def run_race(job, out, ledger, catalog):
    dest=out/"races"/(job["id"]+".json")
    if dest.exists(): return
    definition=get_benchmark(PAPER_BENCHMARK_VERSION)
    agents=[]; calls=[]; game=None
    try:
        agents=[make_agent(job["model"],job["id"],ledger,catalog[job["model"]]["pricing"],player_id=f"p{i}",label=["Helios","Vantage","Kepler","Meridian","Aurora"][i],condition=job["condition"],audit_sink=calls.append) for i in range(job["players"])]
        canonical=job["condition"]=="canonical"
        game=PaperGame(agents,risk_treatment=job["risk"],seed=job["seed"],game_id=job["id"][:12],backend="paper-openrouter-research",spec_hash=definition.spec_hash,protocol_hash=definition.protocol_hash if canonical else protocol_hash(job["condition"]),protocol_version=PAPER_PROTOCOL_VERSION if canonical else f"{RESEARCH_PROTOCOL}:{job['condition']}")
        record=game.play().to_dict()
        record.update({"research":job,"contributor":CONTRIBUTOR,"cost_usd":sum(float(c.get("usage",{}).get("cost") or 0) for c in calls)})
        write_json(dest,record)
        print(f"{job['module']} {job['model']} {job['risk']} {job['players']}P rep={job['repetition']} {job['condition']}: {record['admission_status']} ${ledger.spent:.4f}",flush=True)
    except Exception as exc:
        record={"research":job,"contributor":CONTRIBUTOR,"status":"failed","error":str(exc)[:800],"partial":game.record.to_dict() if game else None}
        write_json(dest,record)
        print(f"FAILED {job['id']} {job['model']}: {str(exc)[:140]}",flush=True)
    finally:
        write_json(out/"calls"/(job["id"]+".json"),calls)
        for agent in agents: agent.close()


def run_audit(model, out, ledger, catalog, variants=("direct",)):
    probes=task_probes()
    for variant in variants:
        dest=out/"audit"/(model.replace("/","--")+"--"+variant+".json")
        if dest.exists(): continue
        rows=[]; calls=[]
        agent=make_agent(model,"audit:"+model+":"+variant,ledger,catalog[model]["pricing"],player_id="audit",label="Audit",audit_sink=calls.append)
        try:
            for probe in probes:
                question=probe["question"]
                if variant=="paraphrase": question="Calculate the quantity or decide the truth of the following query under the stated race rules: "+question
                if variant=="calculator": question+=f"\nVerified calculator result: {probe['answer']}."
                if variant=="reversed": question=question.replace("YES or NO", "NO or YES")
                try:
                    result=agent._call([{"role":"system","content":PAPER_SYSTEM_PROMPT.format(n_players=2,risk_treatment=.6).split("Maximise")[0]+"Reply with just one number, or YES/NO when asked. No explanation."},{"role":"user","content":question}],max_tokens=1600,phase="audit-"+probe["id"])
                    correct,strict=score_probe(result.content,probe["answer"])
                    rows.append({**probe,"variant":variant,"response":result.content,"correct":correct,"strict":strict,"status":"completed"})
                except Exception as exc:
                    rows.append({**probe,"variant":variant,"correct":False,"strict":False,"status":"failed","error":str(exc)[:300]})
                write_json(dest,{"model":model,"variant":variant,"protocol":"reconstructed-41-probes-v1","contributor":CONTRIBUTOR,"rows":rows,"complete":len(rows)==len(probes)})
        finally:
            write_json(out/"calls"/("audit-"+model.replace("/","--")+"-"+variant+".json"),calls)
            agent.close()
        print(f"AUDIT {model} {variant}: {sum(r['correct'] for r in rows)}/{len(rows)} ${ledger.spent:.4f}",flush=True)


def run_replays(out, ledger, catalog):
    from moloch.benchmark.versions.paper_2608_01193_v1.agents import PaperGameView, PaperPublicPlayer
    from moloch.benchmark.versions.paper_2608_01193_v1.spec import PAPER_SPEC, PaperAction
    from moloch.research import SKINS
    model="qwen/qwen-2.5-7b-instruct"
    tasks=[]
    def replay_one(task):
        job,dest,j,t,skin,mapping,view=task
        if dest.exists(): return
        calls=[]
        agent=make_agent(model,job,ledger,catalog[model]["pricing"],player_id="p0",label=view.me.label,condition=f"opaque:{skin}:{mapping}",audit_sink=calls.append)
        try:
            action=agent.decide(view)
            row={"job":job,"model":model,"race":j['id'],"risk":j["risk"],"round":t,"skin":skin,"mapping":mapping,"action":action.value,"readable":agent.last_action_readable,"contributor":CONTRIBUTOR}
        except Exception as exc: row={"job":job,"status":"failed","error":str(exc)[:300],"contributor":CONTRIBUTOR}
        finally: agent.close()
        write_json(dest,row); write_json(out/"calls"/(dest.stem+".json"),calls)
    for file in sorted((out/"races").glob("*.json")):
        r=json.loads(file.read_text(encoding="utf-8"))
        j=r["research"]
        if r.get("admission_status")!="admitted" or j["module"]!="arithmetic" or j["condition"]!="canonical": continue
        for t in (1,5):
            # Fixed state does not evolve after each answer; both mappings fully crossed.
            before=r["rounds"][t-2]["state_after"] if t>1 else [{"player_id":f"p{i}","progress":0,"stage_payoff":0,"unsafe_count":0} for i in range(2)]
            players=[PaperPublicPlayer(p["player_id"],r["players"][i]["label"],model,p["progress"],p["stage_payoff"]) for i,p in enumerate(before)]
            previous=tuple((a["player_id"],PaperAction(a["action"])) for a in r["rounds"][t-2]["actions"]) if t>1 else ()
            view=PaperGameView(PAPER_SPEC,t,j["risk"],players[0],(players[1],),before[0]["unsafe_count"],previous)
            for skin in SKINS:
                for mapping in ("P","Q"):
                    job=f"replay:{j['id']}:{t}:{skin}:{mapping}"
                    dest=out/"replays"/(hashlib.sha256(job.encode()).hexdigest()[:16]+".json")
                    tasks.append((job,dest,j,t,skin,mapping,view))
    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(replay_one,tasks))
    print(f"Fixed-state replay complete; ${ledger.spent:.4f}",flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",type=Path,default=Path("../docs/results/reproduction-20261005"))
    parser.add_argument("--stage",choices=("baseline","diagnostics","all"),default="all")
    parser.add_argument("--workers",type=int,default=3)
    args=parser.parse_args(); out=args.out
    out.mkdir(parents=True,exist_ok=True)
    catalog_path=out/"catalog.json"
    if catalog_path.exists(): catalog=json.loads(catalog_path.read_text())
    else:
        response=httpx.get("https://openrouter.ai/api/v1/models",timeout=30); response.raise_for_status()
        all_models={m["id"]:m for m in response.json()["data"]}
        catalog={model:all_models[model] for model,_,_ in ROSTER}
        write_json(catalog_path,catalog)
    plan_path=out/"manifest.json"
    if not plan_path.exists():
        jobs=build_plan()
        write_json(plan_path,{"created_at":datetime.now(timezone.utc).isoformat(),"master_seed":20261005,"limit_eur":5,"limit_usd":5,"usd_per_eur":1.1225,"fx_date":"2026-10-02","fx_source":"https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.hr.html","contributor":CONTRIBUTOR,"evidence":"exploratory-reconstruction","source_paper":"https://arxiv.org/abs/2608.01193v1","jobs":jobs,"plan_hash":hashlib.sha256(json.dumps(jobs,sort_keys=True).encode()).hexdigest(),"diagnostic_code_hash":protocol_hash("campaign"),"notes":["Canonical V1.1 and diagnostic conditions analysed separately.","No public author prompts/logs: reconstructed probes, skins and persona wording.","Two-player means are player-level, with race-cluster bootstrap intervals.","Both P/Q mappings crossed at each frozen state; no state feedback in replay.","$5 operational ceiling corresponds to about EUR 4.45 at reference FX, leaving margin below EUR 5."]})
    manifest=json.loads(plan_path.read_text())
    if manifest["diagnostic_code_hash"]!=protocol_hash("campaign"):
        raise RuntimeError("Research source changed since manifest freeze; use a new campaign directory")
    ledger=CampaignLedger(out/"ledger.json",manifest["limit_usd"])
    jobs=[j for j in manifest["jobs"] if (j["module"]=="baseline") == (args.stage=="baseline")] if args.stage!="all" else manifest["jobs"]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(lambda j:run_race(j,out,ledger,catalog),jobs))
    if args.stage in ("diagnostics","all"):
        with ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(lambda m:run_audit(m,out,ledger,catalog),[m for m,_,_ in ROSTER]))
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(lambda variant:run_audit("qwen/qwen-2.5-7b-instruct",out,ledger,catalog,(variant,)),("paraphrase","calculator","reversed")))
        run_replays(out,ledger,catalog)
    # Keep database mutations sequential. Failed cells remain in the campaign artefacts.
    conn=db.connect()
    try:
        for file in (out/"races").glob("*.json"):
            record=json.loads(file.read_text(encoding="utf-8"))
            if record.get("admission_status"):
                db.save_game(conn,record,contributor=CONTRIBUTOR)
                calls=json.loads((out/"calls"/(file.stem+".json")).read_text(encoding="utf-8"))
                db.save_provider_calls(conn,record["game_id"],calls)
    finally: conn.close()
    ledger.checkpoint()
    print(f"Campaign accounted total ${ledger.spent:.6f}, EUR {ledger.spent/manifest['usd_per_eur']:.6f}",flush=True)

if __name__=="__main__": main()
